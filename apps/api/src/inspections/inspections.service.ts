import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InspectionType,
  generatePresignedGetUrl,
  generatePresignedPutUrl,
  type Inspection,
} from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { isKeyInPrefix } from '../auth/unit-access';

const CONDITIONS = ['BUENO', 'REGULAR', 'MALO', 'NO_APLICA'];

export interface CreateInspectionDto {
  unitId: string;
  // Optional — defaults to the unit's current active occupancy so the UI only
  // needs to pick a unit. An inspection is always tied to who occupied the unit.
  occupancyId?: string;
  type: string;
}
export interface AddRoomDto {
  roomName: string;
  overallRating: number;
  notes?: string;
  photoR2Keys?: string[];
  items?: { itemName: string; condition: string; notes?: string }[];
}
export interface PhotoUrlDto {
  roomName: string;
  filename: string;
  contentType?: string;
}

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateInspectionDto): Promise<Inspection> {
    if (!dto.unitId) throw new BadRequestException('unitId is required');
    const dbUser = await this.resolveUser(user.userId);

    // Tenant + role: unit must be in the caller's conjunto; only an ADMIN or the
    // unit's own resident may open an inspection for it.
    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit || unit.conjunto_id !== dbUser.conjunto_id) throw new NotFoundException('Unit not found');
    if (user.role !== 'ADMIN' && user.unitId !== dto.unitId) throw new ForbiddenException();

    // Resolve the occupancy: explicit id (validated), else the unit's active one.
    let occupancyId = dto.occupancyId;
    if (occupancyId) {
      const occ = await this.prisma.db.unitOccupancy.findFirst({
        where: { id: occupancyId, unit_id: dto.unitId },
        select: { id: true },
      });
      if (!occ) throw new BadRequestException('occupancyId does not belong to this unit');
    } else {
      const occ = await this.prisma.db.unitOccupancy.findFirst({
        where: { unit_id: dto.unitId, ended_at: null },
        orderBy: { started_at: 'desc' },
        select: { id: true },
      });
      if (!occ) {
        throw new BadRequestException('La unidad no tiene un ocupante activo. Asigna un residente primero.');
      }
      occupancyId = occ.id;
    }

    return this.prisma.db.inspection.create({
      data: {
        conjunto_id: dbUser.conjunto_id,
        unit_id: dto.unitId,
        occupancy_id: occupancyId,
        inspector_id: dbUser.id,
        type: parseType(dto.type),
      },
    });
  }

  async list(user: AuthUser): Promise<Inspection[]> {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const where =
      user.role === 'ADMIN'
        ? { conjunto_id: user.conjuntoId }
        : { conjunto_id: user.conjuntoId, unit_id: user.unitId ?? '__none__' };
    return this.prisma.db.inspection.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  // Full inspection with rooms/items; each photo r2_key resolved to a 300s presigned GET URL.
  async getOne(user: AuthUser, id: string) {
    const insp = await this.prisma.db.inspection.findUnique({
      where: { id },
      include: { rooms: { include: { items: true }, orderBy: { room_name: 'asc' } } },
    });
    this.authorize(user, insp);
    const rooms = await Promise.all(
      insp!.rooms.map(async (room) => ({
        ...room,
        photos: await Promise.all(
          room.photo_r2_keys.map(async (key) => ({
            r2Key: key,
            url: await generatePresignedGetUrl(key),
          })),
        ),
      })),
    );
    return { ...insp!, rooms };
  }

  async addRoom(user: AuthUser, id: string, dto: AddRoomDto) {
    const insp = await this.fetchEditable(user, id);
    if (!dto.roomName?.trim()) throw new BadRequestException('roomName is required');
    if (!Number.isInteger(dto.overallRating) || dto.overallRating < 1 || dto.overallRating > 5) {
      throw new BadRequestException('overallRating must be an integer 1–5');
    }
    // Photo keys must come from this inspection's own upload prefix (requestPhotoUrl).
    // Otherwise any key in the bucket could be stored and served back as a presigned GET.
    const photoPrefix = `conjuntos/${insp.conjunto_id}/units/${insp.unit_id}/inspections/${insp.id}/`;
    const photoKeys = dto.photoR2Keys ?? [];
    if (photoKeys.length > 20 || !photoKeys.every((k) => isKeyInPrefix(k, photoPrefix))) {
      throw new BadRequestException('Invalid photo key');
    }
    for (const item of dto.items ?? []) {
      if (!CONDITIONS.includes(item.condition)) {
        throw new BadRequestException(`Invalid condition: ${item.condition}`);
      }
    }
    return this.prisma.db.inspectionRoom.create({
      data: {
        inspection_id: insp.id,
        room_name: dto.roomName.trim(),
        overall_rating: dto.overallRating,
        notes: dto.notes ?? null,
        photo_r2_keys: photoKeys,
        items: dto.items?.length
          ? {
              create: dto.items.map((it) => ({
                item_name: it.itemName,
                condition: it.condition,
                notes: it.notes ?? null,
              })),
            }
          : undefined,
      },
      include: { items: true },
    });
  }

  // Resident asks for a presigned PUT URL, uploads the photo to R2, then passes
  // the returned r2Key back in addRoom().
  async requestPhotoUrl(user: AuthUser, id: string, dto: PhotoUrlDto) {
    const insp = await this.fetchEditable(user, id);
    if (!dto.filename?.trim() || !dto.roomName?.trim()) {
      throw new BadRequestException('roomName and filename are required');
    }
    const r2Key = `conjuntos/${insp.conjunto_id}/units/${insp.unit_id}/inspections/${insp.id}/${slug(dto.roomName)}/${randomUUID()}-${slug(dto.filename)}`;
    const uploadUrl = await generatePresignedPutUrl(r2Key, imageContentType(dto.contentType));
    return { uploadUrl, r2Key, expiresInSeconds: 300 };
  }

  async submit(user: AuthUser, id: string): Promise<Inspection> {
    const insp = await this.fetchEditable(user, id);
    return this.prisma.db.inspection.update({
      where: { id: insp.id },
      data: { status: 'SUBMITTED', submitted_at: new Date() },
    });
  }

  // Editable only while DRAFT.
  private async fetchEditable(user: AuthUser, id: string): Promise<Inspection> {
    const insp = await this.prisma.db.inspection.findUnique({ where: { id } });
    this.authorize(user, insp);
    if (insp.status !== 'DRAFT') {
      throw new BadRequestException('Inspection is not editable (must be DRAFT)');
    }
    return insp;
  }

  private authorize(user: AuthUser, insp: Inspection | null): asserts insp is Inspection {
    if (!insp || insp.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Inspection not found');
    }
    if (user.role !== 'ADMIN' && insp.unit_id !== user.unitId) throw new ForbiddenException();
  }

  private async resolveUser(authUserId: string) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    return dbUser;
  }
}

function parseType(value: string): InspectionType {
  if (value && value in InspectionType) return value as InspectionType;
  throw new BadRequestException(`Invalid inspection type: ${value}`);
}

function slug(s: string): string {
  return s.trim().replace(/[^\w.\-]+/g, '_');
}

// Photo uploads: only image types (a presigned PUT with text/html would let a
// user host arbitrary pages on the bucket domain).
function imageContentType(value: string | undefined): string {
  return value && /^image\/(jpeg|png|webp|heic|heif)$/.test(value) ? value : 'image/jpeg';
}
