import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { INVITE_RESEND_COOLDOWN_MINUTES, inviteMessage, inviteSignInUrl } from '@nexo/types';
import { OccupancyType, UserRole } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { normalizePhone } from '../auth/phone';
import { InviteMessenger } from './invite-messenger';

export type InviteRole = 'RESIDENT' | 'GUARD' | 'ADMIN' | 'STAFF';
export interface CreateInviteDto {
  phone: string;
  fullName?: string;
  role?: InviteRole;
  unitId?: string;
  occupancyType?: string;
  team?: string; // STAFF only: "Mantenimiento", "Aseo"…
}
export interface BulkInviteRow {
  unitNumber: string;
  phone: string;
  fullName?: string;
  occupancyType?: string;
}
export interface BulkResult {
  row: number;
  unitNumber: string;
  phone: string;
  status: 'invited' | 'skipped' | 'error';
  reason?: string;
}

const ROLES: InviteRole[] = ['RESIDENT', 'GUARD', 'ADMIN', 'STAFF'];
const MAX_BULK = 2000;
const RESEND_COOLDOWN_MS = INVITE_RESEND_COOLDOWN_MINUTES * 60_000;

/**
 * Invitations = pending User rows (external_auth_id = null) keyed by phone.
 * The person signs in with SMS OTP; POST /users/provision matches their
 * Clerk-verified phone and claims the row (see OnboardingService.provision).
 *
 * Creating an invitation also queues an SMS/WhatsApp with the sign-in link
 * (InviteMessenger — background, never awaited by the request).
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: InviteMessenger,
  ) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);
    const rows = await this.prisma.db.user.findMany({
      where: { conjunto_id: conjuntoId, external_auth_id: null, is_active: true },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        full_name: true,
        phone: true,
        role: true,
        team: true,
        created_at: true,
        invite_sent_at: true,
        occupancies: {
          where: { ended_at: null },
          take: 1,
          select: { occupancy_type: true, unit: { select: { unit_number: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phone: r.phone,
      role: r.role,
      team: r.team,
      unitNumber: r.occupancies[0]?.unit.unit_number ?? null,
      occupancyType: r.occupancies[0]?.occupancy_type ?? null,
      createdAt: r.created_at,
      inviteSentAt: r.invite_sent_at,
    }));
  }

  /** What the dashboard needs to build the same message for manual sharing. */
  async settings(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);
    return {
      conjuntoName: await this.conjuntoName(conjuntoId),
      automatic: this.messenger.enabled,
      cooldownMinutes: INVITE_RESEND_COOLDOWN_MINUTES,
    };
  }

  async create(user: AuthUser, dto: CreateInviteDto) {
    const conjuntoId = this.requireAdmin(user);
    return this.createOne(conjuntoId, dto, await this.messageText(conjuntoId));
  }

  /**
   * Re-send the invitation message. At most one per invitation every
   * INVITE_RESEND_COOLDOWN_MINUTES (the first automatic send counts).
   */
  async resend(user: AuthUser, inviteId: string) {
    const conjuntoId = this.requireAdmin(user);
    const row = await this.prisma.db.user.findUnique({ where: { id: inviteId } });
    if (!row || row.conjunto_id !== conjuntoId || row.external_auth_id || !row.is_active) {
      throw new NotFoundException('Invitación no encontrada');
    }
    if (!this.messenger.enabled) {
      return { id: row.id, sent: false as const, reason: 'not_configured' as const };
    }
    const now = new Date();
    // Conditional claim: two simultaneous clicks can't both pass the cooldown.
    const claim = await this.prisma.db.user.updateMany({
      where: {
        id: row.id,
        conjunto_id: conjuntoId,
        external_auth_id: null,
        OR: [{ invite_sent_at: null }, { invite_sent_at: { lte: new Date(now.getTime() - RESEND_COOLDOWN_MS) } }],
      },
      data: { invite_sent_at: now },
    });
    if (claim.count === 0) {
      const last = row.invite_sent_at?.getTime() ?? now.getTime();
      const retryAfterSeconds = Math.max(1, Math.ceil((last + RESEND_COOLDOWN_MS - now.getTime()) / 1000));
      throw new HttpException(
        {
          code: 'INVITE_RESEND_COOLDOWN',
          message: `Ya se envió hace poco. Intenta de nuevo en ${Math.ceil(retryAfterSeconds / 60)} min.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const ok = await this.messenger.sendNow(
      { conjuntoId, userId: row.id, phone: row.phone, text: await this.messageText(conjuntoId), stampedAt: now },
      row.invite_sent_at,
    );
    if (!ok) throw new ServiceUnavailableException('No se pudo enviar el mensaje. Intenta de nuevo.');
    return { id: row.id, sent: true as const, inviteSentAt: now };
  }

  private async conjuntoName(conjuntoId: string): Promise<string> {
    const c = await this.prisma.db.conjunto.findUnique({ where: { id: conjuntoId }, select: { name: true } });
    return c?.name ?? '';
  }

  private async messageText(conjuntoId: string): Promise<string> {
    return inviteMessage(await this.conjuntoName(conjuntoId), inviteSignInUrl(process.env.APP_URL));
  }

  async bulk(user: AuthUser, rows: BulkInviteRow[]): Promise<{ results: BulkResult[] }> {
    const conjuntoId = this.requireAdmin(user);
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('rows is required');
    if (rows.length > MAX_BULK) throw new BadRequestException(`Máximo ${MAX_BULK} filas por carga`);

    const units = await this.prisma.db.unit.findMany({
      where: { conjunto_id: conjuntoId },
      select: { id: true, unit_number: true },
    });
    const byNumber = new Map(units.map((u) => [u.unit_number.trim().toLowerCase(), u.id]));

    const text = await this.messageText(conjuntoId);
    const results: BulkResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const unitNumber = String(r.unitNumber ?? '').trim();
      const phone = String(r.phone ?? '').trim();
      const base = { row: i + 1, unitNumber, phone };
      const unitId = byNumber.get(unitNumber.toLowerCase());
      if (!unitId) {
        results.push({ ...base, status: 'error', reason: 'Unidad no existe' });
        continue;
      }
      try {
        await this.createOne(
          conjuntoId,
          { phone, fullName: r.fullName, role: 'RESIDENT', unitId, occupancyType: r.occupancyType },
          text,
        );
        results.push({ ...base, status: 'invited' });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Error';
        results.push({ ...base, status: err instanceof ConflictException ? 'skipped' : 'error', reason });
      }
    }
    return { results };
  }

  async revoke(user: AuthUser, inviteId: string) {
    const conjuntoId = this.requireAdmin(user);
    const row = await this.prisma.db.user.findUnique({ where: { id: inviteId } });
    if (!row || row.conjunto_id !== conjuntoId || row.external_auth_id) {
      throw new NotFoundException('Invitación no encontrada');
    }
    // Soft-revoke: keeps FK history intact; the claim path ignores inactive rows.
    await this.prisma.db.$transaction(async (tx) => {
      await tx.unitOccupancy.updateMany({
        where: { user_id: row.id, ended_at: null },
        data: { ended_at: new Date() },
      });
      await tx.user.update({ where: { id: row.id }, data: { is_active: false } });
    });
    return { id: row.id, revoked: true };
  }

  private async createOne(conjuntoId: string, dto: CreateInviteDto, text: string) {
    const role: InviteRole = dto.role ?? 'RESIDENT';
    if (!ROLES.includes(role)) throw new BadRequestException(`Rol inválido: ${dto.role}`);
    const raw = String(dto.phone ?? '').trim();
    if (!raw) throw new BadRequestException('Celular requerido');
    const phone = normalizePhone(raw);
    if (!/^\+\d{10,15}$/.test(phone)) throw new BadRequestException(`Celular inválido: ${raw}`);

    let occupancyType: OccupancyType | null = null;
    if (role === 'RESIDENT') {
      if (!dto.unitId) throw new BadRequestException('unitId es requerido para residentes');
      const unit = await this.prisma.db.unit.findUnique({
        where: { id: dto.unitId },
        select: { conjunto_id: true },
      });
      if (!unit || unit.conjunto_id !== conjuntoId) throw new BadRequestException('Unidad inválida');
      const t = String(dto.occupancyType ?? 'OWNER').toUpperCase();
      occupancyType = t in OccupancyType ? (t as OccupancyType) : OccupancyType.OWNER;
    }

    // Same phone already pending (or active) in this conjunto → don't duplicate.
    const dup = await this.prisma.db.user.findFirst({
      where: { conjunto_id: conjuntoId, phone, is_active: true },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Ese celular ya está invitado o registrado');

    const created = await this.prisma.db.user.create({
      data: {
        conjunto_id: conjuntoId,
        phone,
        full_name:
          dto.fullName?.trim() ||
          ({ GUARD: 'Portería', ADMIN: 'Administrador', STAFF: 'Personal', RESIDENT: 'Residente' } as const)[role],
        role: role as UserRole,
        team: role === 'STAFF' ? dto.team?.trim().slice(0, 60) || null : null,
        // Stamped up front (starts the resend cooldown); the messenger clears it if the send fails.
        invite_sent_at: this.messenger.enabled ? new Date() : null,
      },
    });
    if (role === 'RESIDENT' && dto.unitId && occupancyType) {
      await this.prisma.db.unitOccupancy.create({
        data: { unit_id: dto.unitId, user_id: created.id, occupancy_type: occupancyType, started_at: new Date() },
      });
    }
    // Background send — the response never waits for the provider.
    const messageQueued = !!created.invite_sent_at;
    if (created.invite_sent_at) {
      this.messenger.enqueue({ conjuntoId, userId: created.id, phone, text, stampedAt: created.invite_sent_at });
    }
    return { id: created.id, phone, role, unitId: dto.unitId ?? null, messageQueued };
  }
}
