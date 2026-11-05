import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { dayRangeCOT } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateSpotDto {
  spotNumber: string;
  spotType?: 'RESIDENT' | 'VISITOR';
  unitId?: string;
}
export interface EntryDto {
  spotId: string;
  licensePlate: string;
  visitorName?: string;
  unitVisited?: string;
}

@Injectable()
export class ParkingService {
  constructor(private readonly prisma: PrismaService) {}

  private requireConjunto(user: AuthUser): string {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async listSpots(user: AuthUser) {
    const conjuntoId = this.requireConjunto(user);
    return this.prisma.db.parkingSpot.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: { spot_number: 'asc' },
    });
  }

  async createSpot(user: AuthUser, dto: CreateSpotDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.spotNumber?.trim()) throw new BadRequestException('spotNumber is required');

    return this.prisma.db.parkingSpot.create({
      data: {
        conjunto_id: conjuntoId,
        spot_number: dto.spotNumber.trim(),
        spot_type: dto.spotType ?? 'VISITOR',
        unit_id: dto.unitId?.trim() || null,
      },
    });
  }

  async listAvailableSpots(user: AuthUser) {
    const conjuntoId = this.requireConjunto(user);
    return this.prisma.db.parkingSpot.findMany({
      where: { conjunto_id: conjuntoId, sessions: { none: { exited_at: null } } },
      orderBy: { spot_number: 'asc' },
    });
  }

  async logEntry(user: AuthUser, dto: EntryDto) {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.spotId) throw new BadRequestException('spotId is required');
    if (!dto.licensePlate?.trim()) throw new BadRequestException('licensePlate is required');

    const spot = await this.prisma.db.parkingSpot.findUnique({ where: { id: dto.spotId } });
    if (!spot || spot.conjunto_id !== conjuntoId) throw new NotFoundException('Spot not found');

    const active = await this.prisma.db.parkingSession.findFirst({
      where: { spot_id: dto.spotId, exited_at: null },
    });
    if (active) throw new BadRequestException('Spot is already occupied');

    return this.prisma.db.parkingSession.create({
      data: {
        conjunto_id: conjuntoId,
        spot_id: dto.spotId,
        license_plate: dto.licensePlate.trim().toUpperCase(),
        visitor_name: dto.visitorName?.trim() || null,
        unit_visited: dto.unitVisited?.trim() || null,
      },
    });
  }

  async logExit(user: AuthUser, sessionId: string) {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);

    const session = await this.prisma.db.parkingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.conjunto_id !== conjuntoId) {
      throw new NotFoundException('Session not found');
    }
    if (session.exited_at) throw new BadRequestException('Session already closed');

    const conjunto = await this.prisma.db.conjunto.findUnique({
      where: { id: conjuntoId },
      select: { parking_rate_per_hour: true },
    });
    const rate = new Decimal(conjunto?.parking_rate_per_hour ?? 0);

    const exitedAt = new Date();
    const ms = exitedAt.getTime() - session.entered_at.getTime();
    const hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60))); // round up, min 1h
    const amount = rate.mul(hours).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return this.prisma.db.parkingSession.update({
      where: { id: sessionId },
      data: { exited_at: exitedAt, amount_charged: amount },
    });
  }

  async listSessions(user: AuthUser, spotId?: string, date?: string) {
    const conjuntoId = this.requireConjunto(user);
    const where: {
      conjunto_id: string;
      spot_id?: string;
      entered_at?: { gte: Date; lt: Date };
    } = { conjunto_id: conjuntoId };
    if (spotId) where.spot_id = spotId;
    if (date) {
      try {
        where.entered_at = dayRangeCOT(date);
      } catch {
        throw new BadRequestException('date must be YYYY-MM-DD');
      }
    }
    return this.prisma.db.parkingSession.findMany({
      where,
      orderBy: { entered_at: 'desc' },
      take: 200,
      include: { spot: { select: { spot_number: true } } },
    });
  }
}
