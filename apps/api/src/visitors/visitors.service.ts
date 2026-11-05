import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATIONS_QUEUE,
  VISITOR_ARRIVED,
} from '../notifications/notifications.processor';
import { encryptCedula } from './cedula-crypto';
import type { AuthUser } from '../auth/auth.types';

const MAX_QR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface GenerateQrDto {
  visitorName: string;
  validFrom: string;
  validUntil: string;
  unitId: string;
}
export interface ScanDto {
  qrToken: string;
}
export interface WalkinDto {
  visitorName: string;
  cedulaRaw: string;
  destinationUnitId: string;
  habeasDataAccepted: boolean;
}

@Injectable()
export class VisitorsService {
  private readonly logger = new Logger(VisitorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
  ) {}

  // 5.1 — resident/admin pre-authorizes a visitor.
  async generateQr(user: AuthUser, dto: GenerateQrDto) {
    if (user.role !== 'RESIDENT' && user.role !== 'ADMIN') throw new ForbiddenException();
    if (!dto.visitorName?.trim()) throw new BadRequestException('visitorName is required');
    if (!dto.unitId) throw new BadRequestException('unitId is required');

    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      throw new BadRequestException('validFrom/validUntil must be valid dates');
    }
    if (validUntil <= validFrom) throw new BadRequestException('validUntil must be after validFrom');
    if (validUntil.getTime() - Date.now() > MAX_QR_WINDOW_MS) {
      throw new BadRequestException('validUntil cannot be more than 30 days from now');
    }

    const dbUser = await this.resolveUser(user.userId);
    // Tenant + ownership: the unit must be in the caller's conjunto, and a
    // RESIDENT may only pre-authorize visitors for their OWN unit.
    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit || unit.conjunto_id !== dbUser.conjunto_id) throw new NotFoundException('Unit not found');
    if (user.role === 'RESIDENT' && user.unitId !== dto.unitId) throw new ForbiddenException();

    const qrToken = randomUUID();
    const qr = await this.prisma.db.visitorQrCode.create({
      data: {
        conjunto_id: dbUser.conjunto_id,
        unit_id: dto.unitId,
        created_by_id: dbUser.id,
        visitor_name: dto.visitorName.trim(),
        valid_from: validFrom,
        valid_until: validUntil,
        qr_token: qrToken,
        status: 'PRE_AUTHORIZED',
      },
    });

    return {
      qrCodeId: qr.id,
      qrToken: qr.qr_token,
      validFrom: qr.valid_from.toISOString(),
      validUntil: qr.valid_until.toISOString(),
      visitorName: qr.visitor_name,
    };
  }

  // The QR codes created by the current resident, newest first.
  async listQrCodes(user: AuthUser) {
    const dbUser = await this.resolveUser(user.userId);
    return this.prisma.db.visitorQrCode.findMany({
      where: { created_by_id: dbUser.id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  // 5.2 — guard tablet scans a QR token.
  async scan(user: AuthUser, dto: ScanDto) {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    if (!dto.qrToken) throw new BadRequestException('qrToken is required');

    const qr = await this.prisma.db.visitorQrCode.findUnique({
      where: { qr_token: dto.qrToken },
      include: { created_by: true, visitor_log: true },
    });
    if (!qr || qr.conjunto_id !== user.conjuntoId) throw new NotFoundException('QR not found');

    // Validate state + time window; surface a machine-readable reason on 400.
    if (qr.status === 'CHECKED_IN' || qr.visitor_log) {
      throw new BadRequestException({ message: 'QR already used', reason: 'ALREADY_USED' });
    }
    if (qr.status === 'REVOKED') {
      throw new BadRequestException({ message: 'QR revoked', reason: 'REVOKED' });
    }
    const now = new Date();
    if (qr.status !== 'PRE_AUTHORIZED' || now < qr.valid_from || now > qr.valid_until) {
      throw new BadRequestException({ message: 'QR expired', reason: 'EXPIRED' });
    }

    const guard = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    const unit = await this.prisma.db.unit.findUnique({ where: { id: qr.unit_id } });

    try {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.visitorLog.create({
          data: {
            conjunto_id: qr.conjunto_id,
            unit_id: qr.unit_id,
            qr_code_id: qr.id,
            visitor_name: qr.visitor_name,
            status: 'CHECKED_IN',
            guard_user_id: guard?.id ?? null,
            checked_in_at: now,
          },
        });
        await tx.visitorQrCode.update({
          where: { id: qr.id },
          data: { status: 'CHECKED_IN' },
        });
      });
    } catch (err) {
      // Concurrent double-scan: the second hit violates the qr_code_id unique
      // constraint (P2002). Surface the clean ALREADY_USED reason, not a 500.
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException({ message: 'QR already used', reason: 'ALREADY_USED' });
      }
      throw err;
    }

    this.notifyArrival(qr.unit_id, qr.visitor_name, 'QR');

    return {
      unitId: qr.unit_id,
      unitNumber: unit?.unit_number ?? null,
      visitorName: qr.visitor_name,
      residentName: qr.created_by.full_name,
    };
  }

  // 5.3 — guard logs an unannounced visitor (Habeas Data gated, cédula encrypted).
  async walkin(user: AuthUser, dto: WalkinDto) {
    if (user.role !== 'GUARD' && user.role !== 'ADMIN') throw new ForbiddenException();
    if (dto.habeasDataAccepted !== true) {
      throw new BadRequestException('Habeas Data consent required (Ley 1581) — cannot log visitor');
    }
    if (!dto.visitorName?.trim() || !dto.cedulaRaw?.trim() || !dto.destinationUnitId) {
      throw new BadRequestException('visitorName, cedulaRaw and destinationUnitId are required');
    }
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');

    // Tenant: the destination unit must belong to the guard's conjunto.
    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.destinationUnitId } });
    if (!unit || unit.conjunto_id !== user.conjuntoId) throw new NotFoundException('Unit not found');

    const guard = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });

    const log = await this.prisma.db.visitorLog.create({
      data: {
        conjunto_id: user.conjuntoId,
        unit_id: dto.destinationUnitId,
        visitor_name: dto.visitorName.trim(),
        cedula_encrypted: encryptCedula(dto.cedulaRaw.trim()),
        habeas_data_accepted: true,
        status: 'CHECKED_IN',
        guard_user_id: guard?.id ?? null,
        checked_in_at: new Date(),
      },
    });

    this.notifyArrival(dto.destinationUnitId, dto.visitorName.trim(), 'WALK_IN');

    return {
      visitorLogId: log.id,
      status: log.status,
      visitorName: log.visitor_name,
      unitId: log.unit_id,
    };
  }

  // Fire-and-forget — never awaited, never throws into the request.
  private notifyArrival(unitId: string, visitorName: string, via: 'QR' | 'WALK_IN'): void {
    void this.notifications
      .add(VISITOR_ARRIVED, { unitId, visitorName, via })
      .catch((err: unknown) =>
        this.logger.warn(`Failed to enqueue visitor notification: ${String(err)}`),
      );
  }

  private async resolveUser(authUserId: string) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    return dbUser;
  }
}
