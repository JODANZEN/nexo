import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkService } from '../clerk/clerk.service';
import { HubspotService } from '../integrations/hubspot.service';
import type { AuthUser } from '../auth/auth.types';
import { normalizePhone } from '../auth/phone';
import { canCreateConjunto } from '../auth/platform';

export interface CreateConjuntoDto {
  name: string;
  nit: string;
  address: string;
  city: string;
  department?: string;
  totalUnits: number;
  // Platform flow: invite the client's administrator by phone. When set, the
  // creator does NOT become admin of this conjunto.
  adminPhone?: string;
  adminName?: string;
}
export interface ProvisionDto {
  conjuntoId?: string;
  fullName?: string;
  phone?: string;
}
export interface InviteDto {
  phone: string;
  fullName?: string;
}
export interface AssignResidentDto {
  clerkUserId: string;
  phone: string;
  fullName?: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly hubspot: HubspotService,
  ) {}

  // Gated in the controller (canCreateConjunto).
  async createConjunto(dto: CreateConjuntoDto, creator?: AuthUser) {
    if (!dto.name?.trim() || !dto.nit?.trim()) {
      throw new BadRequestException('name and nit are required');
    }
    if (dto.adminPhone?.trim()) {
      const phone = normalizePhone(dto.adminPhone);
      return this.prisma.db.$transaction(async (tx) => {
        const conjunto = await tx.conjunto.create({
          data: {
            name: dto.name.trim(),
            nit: dto.nit.trim(),
            address: dto.address?.trim() || '',
            city: dto.city?.trim() || '',
            department: dto.department?.trim() || '',
            total_units: Number(dto.totalUnits) || 0,
          },
        });
        await tx.user.create({
          data: {
            conjunto_id: conjunto.id,
            phone,
            full_name: dto.adminName?.trim() || 'Administrador',
            role: 'ADMIN',
          },
        });
        return { ...conjunto, invitedAdminPhone: phone, createdBy: creator?.userId ?? null };
      });
    }
    return this.prisma.db.conjunto.create({
      data: {
        name: dto.name.trim(),
        nit: dto.nit.trim(),
        address: dto.address?.trim() || '',
        city: dto.city?.trim() || '',
        department: dto.department?.trim() || '',
        total_units: Number(dto.totalUnits) || 0,
      },
    });
  }

  // Provision or claim the current Clerk user, and mirror the result into Clerk
  // publicMetadata so the session token carries { conjuntoId, unitId, role }.
  async provision(user: AuthUser, dto: ProvisionDto) {
    const existing = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    if (existing) {
      const occ = await this.getUserOccupancy(existing.id);
      await this.syncMetadata(user.userId, existing.conjunto_id, occ, existing.role);
      return this.shape(existing.id, existing.conjunto_id, occ?.unitId ?? null, existing.role);
    }

    // ── Admin path: create the first admin of a conjunto they just created. ──
    if (dto.conjuntoId) {
      // Only whoever may create conjuntos may claim an empty one as its first admin.
      if (!canCreateConjunto(user)) throw new ForbiddenException('No tienes invitación');
      const userCount = await this.prisma.db.user.count({
        where: { conjunto_id: dto.conjuntoId },
      });
      if (userCount > 0) {
        throw new ForbiddenException('This conjunto already has an administrator');
      }
      const admin = await this.prisma.db.user.create({
        data: {
          conjunto_id: dto.conjuntoId,
          external_auth_id: user.userId,
          full_name: dto.fullName?.trim() || 'Administrador',
          phone: dto.phone?.trim() || '',
          role: 'ADMIN',
        },
      });
      await this.syncMetadata(user.userId, admin.conjunto_id, null, 'ADMIN');
      return this.shape(admin.id, admin.conjunto_id, null, 'ADMIN');
    }

    // ── Resident claim: match a pending invite by the Clerk-verified phone. ──
    const phone = await this.clerk.getPrimaryPhone(user.userId);
    // Any pending invite for this verified phone: resident, portero or admin.
    const invited = phone
      ? await this.prisma.db.user.findFirst({
          where: { phone, external_auth_id: null, is_active: true },
          orderBy: { created_at: 'desc' },
        })
      : null;
    if (!invited) {
      throw new NotFoundException('No invitation found for this account');
    }
    const claimed = await this.prisma.db.user.update({
      where: { id: invited.id },
      data: { external_auth_id: user.userId },
    });
    const occ = await this.getUserOccupancy(claimed.id);
    await this.syncMetadata(user.userId, claimed.conjunto_id, occ, claimed.role);
    return this.shape(claimed.id, claimed.conjunto_id, occ?.unitId ?? null, claimed.role);
  }

  async listUnits(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return this.prisma.db.unit.findMany({
      where: { conjunto_id: user.conjuntoId },
      select: { id: true, unit_number: true, room_type_id: true },
      orderBy: { unit_number: 'asc' },
    });
  }

  // Admin invites a resident: create a pending RESIDENT User keyed by phone.
  // Claimed on the resident's first SMS-OTP login (see provision resident path).
  async invite(user: AuthUser, unitId: string, dto: InviteDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!dto.phone?.trim()) throw new BadRequestException('phone is required');

    const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Unit not found');
    }

    const resident = await this.prisma.db.user.create({
      data: {
        conjunto_id: user.conjuntoId,
        phone: normalizePhone(dto.phone),
        full_name: dto.fullName?.trim() || 'Residente',
        role: 'RESIDENT',
      },
    });
    // The user↔unit link lives in UnitOccupancy (default OWNER).
    await this.prisma.db.unitOccupancy.create({
      data: {
        unit_id: unitId,
        user_id: resident.id,
        occupancy_type: 'OWNER',
        started_at: new Date(),
      },
    });
    return { userId: resident.id, unitId, phone: resident.phone };
  }

  // 11.9 — Admin directly assigns a known Clerk user to a unit as RESIDENT.
  // Upserts the DB User (keyed by Clerk id), links the occupancy, and writes the
  // Clerk publicMetadata so the resident's JWT carries { conjuntoId, unitId, role }.
  async assignResident(user: AuthUser, unitId: string, dto: AssignResidentDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!dto.clerkUserId?.trim()) throw new BadRequestException('clerkUserId is required');
    if (!dto.phone?.trim()) throw new BadRequestException('phone is required');

    const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Unit not found');
    }

    // SECURITY: never re-point an account that already belongs to another conjunto
    // or holds another role. Without this, any admin could overwrite the Clerk
    // metadata of another tenant's admin (demote them / hijack the account).
    const clerkUserId = dto.clerkUserId.trim();
    const already = await this.prisma.db.user.findUnique({
      where: { external_auth_id: clerkUserId },
    });
    if (already && (already.conjunto_id !== user.conjuntoId || already.role !== 'RESIDENT')) {
      throw new ForbiddenException('Ese usuario ya pertenece a otra cuenta o tiene otro rol');
    }
    const phone = normalizePhone(dto.phone);

    const resident = await this.prisma.db.user
      .upsert({
      where: { external_auth_id: clerkUserId },
      update: { phone, full_name: dto.fullName?.trim() || undefined },
      create: {
        conjunto_id: user.conjuntoId,
        external_auth_id: clerkUserId,
        phone,
        full_name: dto.fullName?.trim() || 'Residente',
        role: 'RESIDENT',
      },
      })
      .catch((err: { code?: string }) => {
        // Under RLS a user of another conjunto is invisible, so the upsert tries to
        // create and hits the unique external_auth_id — same answer as the check above.
        if (err?.code === 'P2002') {
          throw new ForbiddenException('Ese usuario ya pertenece a otra cuenta o tiene otro rol');
        }
        throw err;
      });

    // Link to the unit if not already the active occupant.
    const existingOcc = await this.prisma.db.unitOccupancy.findFirst({
      where: { unit_id: unitId, user_id: resident.id, ended_at: null },
    });
    if (!existingOcc) {
      await this.prisma.db.unitOccupancy.create({
        data: {
          unit_id: unitId,
          user_id: resident.id,
          occupancy_type: 'OWNER',
          started_at: new Date(),
        },
      });
    }

    const occ = await this.getUserOccupancy(resident.id);
    await this.syncMetadata(clerkUserId, user.conjuntoId, occ, 'RESIDENT');

    // Fire-and-forget CRM sync (no-op until HubSpot is configured).
    const [firstName, ...rest] = (resident.full_name || '').trim().split(' ');
    void this.hubspot
      .upsertContact({ phone: resident.phone, firstName: firstName || null, lastName: rest.join(' ') || null })
      .catch(() => undefined);

    return { userId: resident.id, unitId, phone: resident.phone, role: 'RESIDENT' };
  }

  async me(user: AuthUser) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    const unitId = (await this.getUserOccupancy(dbUser.id))?.unitId ?? null;
    const unit = unitId
      ? await this.prisma.db.unit.findUnique({
          where: { id: unitId },
          select: { unit_number: true },
        })
      : null;
    return {
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      role: dbUser.role,
      unitId,
      unitNumber: unit?.unit_number ?? null,
    };
  }

  private async getUserOccupancy(
    userRowId: string,
  ): Promise<{ unitId: string; occupancyType: string } | null> {
    const occ = await this.prisma.db.unitOccupancy.findFirst({
      where: { user_id: userRowId, ended_at: null },
      orderBy: { started_at: 'desc' },
      select: { unit_id: true, occupancy_type: true },
    });
    return occ ? { unitId: occ.unit_id, occupancyType: String(occ.occupancy_type) } : null;
  }

  // occupancyType must be in the token: UNIT_OWNER documents check it, and before
  // this it was never written, so owners got 403 on their own unit's documents.
  private async syncMetadata(
    clerkUserId: string,
    conjuntoId: string,
    occ: { unitId: string; occupancyType: string } | null,
    role: string,
  ) {
    await this.clerk.setPublicMetadata(clerkUserId, {
      conjuntoId,
      unitId: occ?.unitId ?? undefined,
      occupancyType: occ?.occupancyType ?? undefined,
      role,
    });
  }

  private shape(userId: string, conjuntoId: string, unitId: string | null, role: string) {
    return { userId, conjuntoId, unitId, role };
  }
}
