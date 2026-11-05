import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { dayRangeCOT } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateAmenityDto {
  name: string;
  description?: string;
  openTime?: string;
  closeTime?: string;
}
export interface CreateReservationDto {
  amenityId: string;
  startAt: string;
  endAt: string;
  unitId?: string;
}

@Injectable()
export class ReservasService {
  constructor(private readonly prisma: PrismaService) {}

  private requireConjunto(user: AuthUser): string {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async listAmenities(user: AuthUser) {
    const conjuntoId = this.requireConjunto(user);
    return this.prisma.db.amenity.findMany({
      where: { conjunto_id: conjuntoId, is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createAmenity(user: AuthUser, dto: CreateAmenityDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.amenity.create({
      data: {
        conjunto_id: conjuntoId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        open_time: dto.openTime?.trim() || null,
        close_time: dto.closeTime?.trim() || null,
      },
    });
  }

  async listReservations(user: AuthUser, amenityId?: string, date?: string) {
    const conjuntoId = this.requireConjunto(user);
    const where: {
      conjunto_id: string;
      status: string;
      amenity_id?: string;
      start_at?: { gte: Date; lt: Date };
    } = { conjunto_id: conjuntoId, status: 'ACTIVE' };
    if (amenityId) where.amenity_id = amenityId;
    if (date) {
      try {
        where.start_at = dayRangeCOT(date);
      } catch {
        throw new BadRequestException('date must be YYYY-MM-DD');
      }
    }
    return this.prisma.db.reservation.findMany({
      where,
      orderBy: { start_at: 'asc' },
      take: 200,
      include: { amenity: { select: { name: true } } },
    });
  }

  async createReservation(user: AuthUser, dto: CreateReservationDto) {
    const conjuntoId = this.requireConjunto(user);
    if (!dto.amenityId) throw new BadRequestException('amenityId is required');

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startAt/endAt must be valid dates');
    }
    if (end <= start) throw new BadRequestException('endAt must be after startAt');

    const amenity = await this.prisma.db.amenity.findUnique({ where: { id: dto.amenityId } });
    if (!amenity || amenity.conjunto_id !== conjuntoId) throw new NotFoundException('Amenity not found');

    // Conflict check: any ACTIVE reservation for this amenity that overlaps [start, end).
    const overlap = await this.prisma.db.reservation.findFirst({
      where: {
        amenity_id: dto.amenityId,
        status: 'ACTIVE',
        start_at: { lt: end },
        end_at: { gt: start },
      },
    });
    if (overlap) {
      throw new BadRequestException('Ese horario ya está reservado para esta zona común');
    }

    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
      select: { full_name: true },
    });

    return this.prisma.db.reservation.create({
      data: {
        conjunto_id: conjuntoId,
        amenity_id: dto.amenityId,
        unit_id: dto.unitId ?? user.unitId ?? null,
        reserved_by_id: user.userId,
        reserved_by_name: dbUser?.full_name ?? null,
        start_at: start,
        end_at: end,
        status: 'ACTIVE',
      },
    });
  }

  async cancelReservation(user: AuthUser, id: string) {
    const conjuntoId = this.requireConjunto(user);
    const reservation = await this.prisma.db.reservation.findUnique({ where: { id } });
    if (!reservation || reservation.conjunto_id !== conjuntoId) {
      throw new NotFoundException('Reservation not found');
    }
    // Admin cancels any; a resident only their own.
    if (user.role !== 'ADMIN' && reservation.reserved_by_id !== user.userId) {
      throw new ForbiddenException();
    }
    await this.prisma.db.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { id, status: 'CANCELLED' };
  }
}
