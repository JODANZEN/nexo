import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { EntryAuthorizationStatus as S, PqrStatus, type EntryAuthorization } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PqrsService } from './pqrs.service';

export interface RequestEntryDto {
  windowStart: string;
  windowEnd: string;
  reason?: string;
}

const HOUR_MS = 3_600_000;
const MAX_WINDOW_MS = 72 * HOUR_MS;
const MAX_AHEAD_MS = 30 * 24 * HOUR_MS;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Entry authorization tied to a ticket: staff asks to enter the unit in a time
 * window → residents of the unit approve/deny in the portal or from a one-time
 * link (no login, for SMS/WhatsApp) → portería sees approved, current entries and
 * marks them used. Requesting pauses the ticket's clock (it's waiting on the
 * resident); the decision resumes it.
 */
@Injectable()
export class EntryAuthorizationsService {
  private readonly logger = new Logger(EntryAuthorizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pqrs: PqrsService,
    private readonly notifier: NotificationsService,
  ) {}

  private async me(user: AuthUser) {
    const u = await this.prisma.db.user.findUnique({ where: { external_auth_id: user.userId } });
    if (!u) throw new NotFoundException('User not provisioned');
    return u;
  }

  async request(user: AuthUser, pqrId: string, dto: RequestEntryDto) {
    const { pqr, access } = await this.pqrs.accessFor(user, pqrId);
    if (access === 'resident') throw new ForbiddenException();
    if (!pqr.unit_id) throw new BadRequestException('La solicitud no tiene unidad asociada');
    if (pqr.status === PqrStatus.RESOLVED || pqr.status === PqrStatus.CLOSED) {
      throw new BadRequestException('La solicitud ya está cerrada');
    }
    const start = new Date(dto.windowStart);
    const end = new Date(dto.windowEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Fechas inválidas');
    if (end <= start) throw new BadRequestException('La hora final debe ser posterior a la inicial');
    if (end.getTime() - start.getTime() > MAX_WINDOW_MS) throw new BadRequestException('Ventana máxima: 72 horas');
    if (end.getTime() < Date.now()) throw new BadRequestException('La ventana ya pasó');
    if (start.getTime() - Date.now() > MAX_AHEAD_MS) throw new BadRequestException('Máximo 30 días de anticipación');

    const requester = await this.me(user);
    const token = randomBytes(24).toString('base64url');
    const auth = await this.prisma.db.$transaction(async (tx) => {
      // One live request per ticket: a new one replaces the pending one.
      await tx.entryAuthorization.updateMany({
        where: { pqr_id: pqr.id, status: S.PENDING },
        data: { status: S.CANCELLED },
      });
      return tx.entryAuthorization.create({
        data: {
          conjunto_id: pqr.conjunto_id,
          pqr_id: pqr.id,
          unit_id: pqr.unit_id!,
          requested_by_id: requester.id,
          reason: dto.reason?.trim().slice(0, 300) || null,
          window_start: start,
          window_end: end,
          token_hash: hashToken(token),
        },
      });
    });

    // Waiting on the resident → pause the clock (OPEN must pass through IN_REVIEW).
    if (pqr.status === PqrStatus.OPEN) await this.pqrs.updateStatus(user, pqr.id, PqrStatus.IN_REVIEW);
    if (pqr.status === PqrStatus.OPEN || pqr.status === PqrStatus.IN_REVIEW) {
      await this.pqrs.updateStatus(user, pqr.id, PqrStatus.AWAITING_RESIDENT);
    }

    const when = formatWindow(start, end);
    const url = `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/autorizar/${token}`;
    void this.notifier
      .notifyUnitResidents(pqr.unit_id, {
        type: 'entry.requested',
        title: `¿Autorizas el ingreso a tu unidad? (${pqr.title})`,
        body: `${when}${auth.reason ? ` · ${auth.reason}` : ''}`,
        // The one-time link only travels by SMS/WhatsApp/email, never into the DB feed.
        deliveryText: `${when}. Responde aquí: ${url}`,
        entityType: 'Pqr',
        entityId: pqr.id,
        link: `/portal/solicitudes/${pqr.id}`,
      })
      .catch((err: unknown) => this.logger.warn(`entry notify failed: ${String(err)}`));

    return { ...this.shape(auth), approvalUrl: url };
  }

  async listForTicket(user: AuthUser, pqrId: string) {
    await this.pqrs.accessFor(user, pqrId);
    await this.expireStale({ pqr_id: pqrId });
    const rows = await this.prisma.db.entryAuthorization.findMany({
      where: { pqr_id: pqrId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.shape(r));
  }

  /** Signed-in resident (or admin) decides from the portal. */
  async decide(user: AuthUser, id: string, approve: boolean, note?: string) {
    const auth = await this.prisma.db.entryAuthorization.findUnique({ where: { id } });
    if (!auth || auth.conjunto_id !== user.conjuntoId) throw new NotFoundException();
    const isResident = user.role === 'RESIDENT' && user.unitId === auth.unit_id;
    if (!isResident && user.role !== 'ADMIN') throw new ForbiddenException();
    const me = await this.me(user);
    return this.applyDecision(auth, approve, note, me.id, me.full_name);
  }

  /** One-time link (no login). Returns only what the resident needs to decide. */
  async publicView(token: string) {
    const auth = await this.byToken(token);
    const [pqr, unit, cj] = await Promise.all([
      this.prisma.db.pqr.findUnique({ where: { id: auth.pqr_id }, select: { title: true } }),
      this.prisma.db.unit.findUnique({ where: { id: auth.unit_id }, select: { unit_number: true } }),
      this.prisma.db.conjunto.findUnique({ where: { id: auth.conjunto_id }, select: { name: true } }),
    ]);
    return {
      conjunto: cj?.name ?? '',
      unitNumber: unit?.unit_number ?? '',
      ticketTitle: pqr?.title ?? '',
      reason: auth.reason,
      windowStart: auth.window_start,
      windowEnd: auth.window_end,
      status: auth.status,
    };
  }

  async publicDecide(token: string, approve: boolean, note?: string) {
    const auth = await this.byToken(token);
    await this.applyDecision(auth, approve, note, null, 'el residente (enlace)');
    return this.publicView(token);
  }

  /** Portería / staff: approved entries whose window is open now (or later today). */
  async active(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!['ADMIN', 'GUARD', 'STAFF'].includes(user.role ?? '')) throw new ForbiddenException();
    await this.expireStale({ conjunto_id: user.conjuntoId });
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * HOUR_MS);
    const rows = await this.prisma.db.entryAuthorization.findMany({
      where: {
        conjunto_id: user.conjuntoId,
        status: S.APPROVED,
        window_end: { gte: now },
        window_start: { lte: horizon },
      },
      orderBy: { window_start: 'asc' },
      include: { pqr: { select: { title: true, assigned_to_id: true } } },
    });
    const ids = [...new Set(rows.flatMap((r) => [r.unit_id]))];
    const people = [...new Set(rows.flatMap((r) => [r.requested_by_id, r.pqr.assigned_to_id].filter(Boolean)))] as string[];
    const [units, users] = await Promise.all([
      this.prisma.db.unit.findMany({ where: { id: { in: ids } }, select: { id: true, unit_number: true } }),
      this.prisma.db.user.findMany({ where: { id: { in: people } }, select: { id: true, full_name: true } }),
    ]);
    const unitBy = new Map(units.map((u) => [u.id, u.unit_number]));
    const userBy = new Map(users.map((u) => [u.id, u.full_name]));
    return rows.map((r) => ({
      ...this.shape(r),
      unitNumber: unitBy.get(r.unit_id) ?? '',
      ticketTitle: r.pqr.title,
      requestedBy: userBy.get(r.requested_by_id) ?? '',
      assignee: r.pqr.assigned_to_id ? userBy.get(r.pqr.assigned_to_id) ?? null : null,
    }));
  }

  /** Portería or the staff member marks the entry as done (logged). */
  async markUsed(user: AuthUser, id: string) {
    if (!['ADMIN', 'GUARD', 'STAFF'].includes(user.role ?? '')) throw new ForbiddenException();
    const auth = await this.prisma.db.entryAuthorization.findUnique({ where: { id } });
    if (!auth || auth.conjunto_id !== user.conjuntoId) throw new NotFoundException();
    const now = Date.now();
    if (auth.status !== S.APPROVED) throw new BadRequestException('La entrada no está aprobada');
    if (now < auth.window_start.getTime() - 15 * 60_000 || now > auth.window_end.getTime()) {
      throw new BadRequestException('Fuera de la ventana autorizada');
    }
    const me = await this.me(user);
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const u = await tx.entryAuthorization.update({ where: { id }, data: { status: S.USED, used_at: new Date() } });
      await tx.auditLog.create({
        data: {
          conjunto_id: auth.conjunto_id,
          actor_id: me.id,
          action: 'entry.used',
          entity_type: 'EntryAuthorization',
          entity_id: id,
          metadata: { pqrId: auth.pqr_id, unitId: auth.unit_id },
        },
      });
      return u;
    });
    return this.shape(updated);
  }

  async cancel(user: AuthUser, id: string) {
    const auth = await this.prisma.db.entryAuthorization.findUnique({ where: { id } });
    if (!auth || auth.conjunto_id !== user.conjuntoId) throw new NotFoundException();
    const me = await this.me(user);
    if (user.role !== 'ADMIN' && auth.requested_by_id !== me.id) throw new ForbiddenException();
    if (auth.status !== S.PENDING && auth.status !== S.APPROVED) throw new BadRequestException('No se puede cancelar');
    const updated = await this.prisma.db.entryAuthorization.update({ where: { id }, data: { status: S.CANCELLED } });
    return this.shape(updated);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async byToken(token: string): Promise<EntryAuthorization> {
    if (!token || token.length < 20 || token.length > 64) throw new NotFoundException();
    const auth = await this.prisma.db.entryAuthorization.findUnique({ where: { token_hash: hashToken(token) } });
    if (!auth) throw new NotFoundException();
    if (auth.status === S.PENDING && auth.window_end.getTime() < Date.now()) {
      return this.prisma.db.entryAuthorization.update({ where: { id: auth.id }, data: { status: S.EXPIRED } });
    }
    return auth;
  }

  private async applyDecision(
    auth: EntryAuthorization,
    approve: boolean,
    note: string | undefined,
    deciderId: string | null,
    deciderName: string,
  ) {
    if (auth.status !== S.PENDING) throw new GoneException('Esta solicitud ya fue respondida o venció');
    if (auth.window_end.getTime() < Date.now()) {
      await this.prisma.db.entryAuthorization.update({ where: { id: auth.id }, data: { status: S.EXPIRED } });
      throw new GoneException('La ventana de ingreso ya pasó');
    }
    // Conditional update: two residents tapping at once can't both decide.
    const res = await this.prisma.db.entryAuthorization.updateMany({
      where: { id: auth.id, status: S.PENDING },
      data: {
        status: approve ? S.APPROVED : S.DENIED,
        decided_at: new Date(),
        decided_by_id: deciderId,
        decision_note: note?.trim().slice(0, 300) || null,
      },
    });
    if (res.count === 0) throw new GoneException('Esta solicitud ya fue respondida');

    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: auth.pqr_id } });
    if (pqr) {
      const verdict = approve ? 'aprobó' : 'no autorizó';
      await this.prisma.db.pqrComment.create({
        data: {
          pqr_id: pqr.id,
          author_id: deciderId ?? auth.requested_by_id,
          body: `🔑 ${capitalize(deciderName)} ${verdict} el ingreso (${formatWindow(auth.window_start, auth.window_end)})${note?.trim() ? `: ${note.trim().slice(0, 300)}` : ''}`,
          is_internal: false,
        },
      });
      // The resident answered → the clock runs again.
      if (pqr.status === PqrStatus.AWAITING_RESIDENT) {
        await this.resume(pqr.id, pqr.conjunto_id);
      }
      await this.notifier
        .notifyUser({
          conjuntoId: pqr.conjunto_id,
          userId: auth.requested_by_id,
          type: approve ? 'entry.approved' : 'entry.denied',
          title: approve ? `✅ Ingreso aprobado: "${pqr.title}"` : `⛔ Ingreso no autorizado: "${pqr.title}"`,
          body: formatWindow(auth.window_start, auth.window_end),
          entityType: 'Pqr',
          entityId: pqr.id,
          link: `/tareas/${pqr.id}`,
        })
        .catch(() => undefined);
    }
    const updated = await this.prisma.db.entryAuthorization.findUnique({ where: { id: auth.id } });
    return this.shape(updated!);
  }

  /** Resume a paused ticket as the system (the decider may be a resident or a link). */
  private async resume(pqrId: string, conjuntoId: string) {
    const admin = { userId: '', conjuntoId, unitId: null, role: 'ADMIN', occupancyType: null };
    await this.pqrs.updateStatus(admin, pqrId, PqrStatus.IN_REVIEW).catch((err: unknown) => {
      this.logger.warn(`resume after entry decision failed: ${String(err)}`);
    });
  }

  private async expireStale(where: { pqr_id?: string; conjunto_id?: string }) {
    await this.prisma.db.entryAuthorization.updateMany({
      where: { ...where, status: { in: [S.PENDING, S.APPROVED] }, window_end: { lt: new Date() } },
      data: { status: S.EXPIRED },
    });
  }

  private shape(a: EntryAuthorization) {
    return {
      id: a.id,
      pqrId: a.pqr_id,
      unitId: a.unit_id,
      status: a.status,
      reason: a.reason,
      windowStart: a.window_start,
      windowEnd: a.window_end,
      decidedAt: a.decided_at,
      decisionNote: a.decision_note,
      usedAt: a.used_at,
      createdAt: a.created_at,
    };
  }
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "jue 6 nov, 9:00 a. m. – 11:00 a. m." in Colombia time. */
export function formatWindow(start: Date, end: Date): string {
  const tz = 'America/Bogota';
  const day = (d: Date) => d.toLocaleDateString('es-CO', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString('es-CO', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return day(start) === day(end)
    ? `${day(start)}, ${time(start)} – ${time(end)}`
    : `${day(start)} ${time(start)} – ${day(end)} ${time(end)}`;
}
