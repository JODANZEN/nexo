import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { generatePresignedPutUrl, type DeliveryLog } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateDeliveryDto {
  carrier: string;
  unitId: string;
  trackingNumber?: string;
  description?: string;
}
export interface PhotoUrlDto {
  filename: string;
  contentType?: string;
}

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Guard logs an incoming package.
  async create(user: AuthUser, dto: CreateDeliveryDto): Promise<DeliveryLog> {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!dto.carrier?.trim() || !dto.unitId) {
      throw new BadRequestException('carrier and unitId are required');
    }
    // Tenant: the unit must belong to the guard's conjunto.
    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit || unit.conjunto_id !== user.conjuntoId) throw new NotFoundException('Unit not found');
    const guard = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    return this.prisma.db.deliveryLog.create({
      data: {
        conjunto_id: user.conjuntoId,
        unit_id: dto.unitId,
        carrier: dto.carrier.trim(),
        tracking_number: dto.trackingNumber ?? null,
        description: dto.description ?? null,
        guard_user_id: guard?.id ?? null,
      },
    });
  }

  // Pending pickups for a unit (not yet picked up). Residents restricted to own unit.
  async listPending(user: AuthUser, unitId: string): Promise<DeliveryLog[]> {
    if (!unitId) throw new BadRequestException('unitId query param is required');
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (user.role !== 'ADMIN' && user.role !== 'GUARD' && user.unitId !== unitId) {
      throw new ForbiddenException();
    }
    return this.prisma.db.deliveryLog.findMany({
      where: { conjunto_id: user.conjuntoId, unit_id: unitId, picked_up_at: null },
      orderBy: { received_at: 'desc' },
    });
  }

  // Resident confirms pickup.
  async confirmPickup(user: AuthUser, id: string): Promise<DeliveryLog> {
    const delivery = await this.fetchInConjunto(user, id);
    if (user.role !== 'ADMIN' && delivery.unit_id !== user.unitId) throw new ForbiddenException();
    if (delivery.picked_up_at) throw new BadRequestException('Delivery already picked up');

    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');

    return this.prisma.db.deliveryLog.update({
      where: { id },
      data: { picked_up_by_id: dbUser.id, picked_up_at: new Date() },
    });
  }

  // Presigned PUT for the package photo (guard uploads straight to R2).
  async requestPhotoUrl(user: AuthUser, id: string, dto: PhotoUrlDto) {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    if (!dto.filename?.trim()) throw new BadRequestException('filename is required');
    const delivery = await this.fetchInConjunto(user, id);

    const r2Key = `conjuntos/${delivery.conjunto_id}/units/${delivery.unit_id}/deliveries/${delivery.id}/${randomUUID()}-${slug(dto.filename)}`;
    const uploadUrl = await generatePresignedPutUrl(r2Key, imageContentType(dto.contentType));
    // Optimistic: record the key now; the guard uploads to it next.
    await this.prisma.db.deliveryLog.update({
      where: { id },
      data: { package_photo_key: r2Key },
    });
    return { uploadUrl, r2Key, expiresInSeconds: 300 };
  }

  private async fetchInConjunto(user: AuthUser, id: string): Promise<DeliveryLog> {
    const delivery = await this.prisma.db.deliveryLog.findUnique({ where: { id } });
    if (!delivery || delivery.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Delivery not found');
    }
    return delivery;
  }
}

function slug(s: string): string {
  return s.trim().replace(/[^\w.\-]+/g, '_');
}

// Photo uploads: only image types (a presigned PUT with text/html would let a
// user host arbitrary pages on the bucket domain).
function imageContentType(value: string | undefined): string {
  return value && /^image\/(jpeg|png|webp|heic|heif)$/.test(value) ? value : 'image/jpeg';
}
