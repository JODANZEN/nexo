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
import {
  Prisma,
  PqrCategory,
  PqrPriority,
  PqrScope,
  PqrStatus,
  UserRole,
  generatePresignedGetUrl,
  generatePresignedPutUrl,
  type Pqr,
  type PqrComment,
} from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import { canTransition } from './pqr-status';
import {
  NOTIFICATIONS_QUEUE,
  PQR_STATUS_CHANGED,
} from '../notifications/notifications.processor';
import { ESCALATION_QUEUE, EVALUATE } from './escalation.processor';
import type { AuthUser } from '../auth/auth.types';
import { isKeyInPrefix } from '../auth/unit-access';
import { NotificationsService } from '../notifications/notifications.service';
import { OperationsService, teamKey } from './operations.service';
import { ASSIGNABLE_ROLES, RoutingService } from './routing.service';
import { addBusinessMs, businessMsBetween, dueAfter } from './sla';

const MAX_ATTACHMENTS = 6;

export interface CreatePqrDto {
  category: string;
  title: string;
  description: string;
  unitId?: string;
  attachments?: string[];
  priority?: string;
  scope?: string;
}

/** Ticket created by the system or staff (preventive maintenance, internal ops). */
export interface InternalTicketInput {
  conjuntoId: string;
  submittedById: string; // users.id
  unitId?: string | null;
  category: PqrCategory;
  priority?: PqrPriority;
  scope?: PqrScope;
  title: string;
  description: string;
  attachments?: string[];
  assignedToId?: string | null; // explicit; otherwise routing rules decide
  maintenancePlanId?: string | null;
}

// SLA targets per priority are configured per conjunto (Operación → Tiempos
// objetivo); see ./sla.ts for defaults and business-hours arithmetic.
const HOUR_MS = 3_600_000;
type Access = 'admin' | 'staff' | 'resident';
export interface PqrPhotoDto {
  filename: string;
  contentType?: string;
}
export interface PqrListFilters {
  status?: string;
  assigned?: string; // 'me' (admin working their own queue)
  scope?: string; // 'team' (jefe de área: everything assigned to their team)
  team?: string; // admin: tickets held by members of this team
  assignee?: string; // admin: users.id, or 'none' for unassigned
}
const WHO = { select: { id: true, full_name: true, team: true } } as const;
export interface AddCommentDto {
  body: string;
  isInternal?: boolean;
}

@Injectable()
export class PqrsService {
  private readonly logger = new Logger(PqrsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(ESCALATION_QUEUE) private readonly escalation: Queue,
    private readonly ops: OperationsService,
    private readonly routing: RoutingService,
    private readonly notifier: NotificationsService,
  ) {}

  // Enqueue an SLA re-evaluation. The processor self-reschedules to the next
  // threshold. Fire-and-forget; a missing Redis just no-ops (lazyConnect).
  private scheduleEscalation(pqrId: string, delayMs: number): void {
    void this.escalation
      .add(EVALUATE, { pqrId }, { delay: delayMs, removeOnComplete: true, removeOnFail: true })
      .catch((err: unknown) => this.logger.warn(`Failed to schedule escalation: ${String(err)}`));
  }

  async create(user: AuthUser, dto: CreatePqrDto): Promise<Pqr> {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!dto.description?.trim()) throw new BadRequestException('description is required');
    const dbUser = await this.resolveUser(user.userId);

    // Unit: residents can only file for their own unit; admins for any unit of
    // their conjunto. (Before, any unitId was accepted.)
    const unitId = dto.unitId ?? user.unitId ?? null;
    if (unitId) {
      if (user.role !== 'ADMIN' && user.role !== 'STAFF' && unitId !== user.unitId) throw new ForbiddenException();
      const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId }, select: { conjunto_id: true } });
      if (!unit || unit.conjunto_id !== dbUser.conjunto_id) throw new ForbiddenException();
    }
    // Attachments must be photos uploaded through /pqrs/photo-url for this conjunto.
    const attachments = dto.attachments ?? [];
    if (attachments.length > MAX_ATTACHMENTS) throw new BadRequestException('Too many attachments');
    const prefix = `conjuntos/${dbUser.conjunto_id}/units/`;
    if (!attachments.every((k) => isKeyInPrefix(k, prefix) && k.includes('/pqr-photos/'))) {
      throw new BadRequestException('Invalid attachment');
    }

    return this.createInternal({
      conjuntoId: dbUser.conjunto_id,
      submittedById: dbUser.id,
      unitId,
      category: parseCategory(dto.category),
      priority: parsePriority(dto.priority) ?? PqrPriority.P3,
      scope: parseScope(dto.scope) ?? PqrScope.IN_UNIT,
      title: dto.title.trim(),
      description: dto.description.trim(),
      attachments,
    });
  }

  /**
   * Shared create path: per-client SLA (business hours aware), auto-assignment via
   * routing rules, assignee notification, escalation kick-off. Callers validate.
   */
  async createInternal(input: InternalTicketInput): Promise<Pqr> {
    const priority = input.priority ?? PqrPriority.P3;
    const scope = input.scope ?? PqrScope.IN_UNIT;
    const { sla, businessHours } = await this.ops.loadConfig(input.conjuntoId);
    const target = sla[priority];
    const now = new Date();
    const assignedToId =
      input.assignedToId ?? (await this.routing.pickAssignee(input.conjuntoId, input.category, scope));

    const created = await this.prisma.db.pqr.create({
      data: {
        conjunto_id: input.conjuntoId,
        unit_id: input.unitId ?? null,
        submitted_by_id: input.submittedById,
        assigned_to_id: assignedToId,
        category: input.category,
        priority,
        scope,
        first_response_due_at: dueAfter(now, target.firstResponse, target, businessHours),
        resolution_due_at: dueAfter(now, target.resolution, target, businessHours),
        title: input.title.slice(0, 200),
        description: input.description.slice(0, 5000),
        attachments: input.attachments ?? [],
        maintenance_plan_id: input.maintenancePlanId ?? null,
      },
    });
    if (assignedToId) this.notifyAssigned(created, assignedToId);
    this.scheduleEscalation(created.id, 1000); // kick off SLA tracking
    return created;
  }

  private notifyAssigned(pqr: Pqr, assigneeId: string): void {
    void (async () => {
      const u = await this.prisma.db.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
      await this.notifier.notifyUser({
        conjuntoId: pqr.conjunto_id,
        userId: assigneeId,
        type: 'pqr.assigned',
        title: `Nueva tarea ${pqr.priority}: "${pqr.title}"`,
        entityType: 'Pqr',
        entityId: pqr.id,
        link: u?.role === 'STAFF' ? `/tareas/${pqr.id}` : `/dashboard/solicitudes/${pqr.id}`,
      });
    })().catch((err: unknown) => this.logger.warn(`assignment notify failed: ${String(err)}`));
  }

  /** Who is asking about this ticket: admin, the assigned staff member, or a resident of its unit. */
  private async access(user: AuthUser, pqr: Pqr | null): Promise<Access> {
    // 404 across tenants (don't leak existence); 403 inside the tenant.
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    if (user.role === 'ADMIN') return 'admin';
    if (user.role === 'STAFF') {
      const me = await this.resolveUser(user.userId);
      if (pqr.assigned_to_id === me.id) return 'staff';
      // Jefe de área: same powers as the assignee on tickets held by their own team.
      // Unassigned tickets and other teams stay out of reach.
      const team = leadTeam(me);
      if (team && pqr.assigned_to_id && (await this.teamMember(pqr.conjunto_id, team, pqr.assigned_to_id))) return 'staff';
      throw new ForbiddenException();
    }
    if (user.role === 'RESIDENT' && pqr.unit_id && pqr.unit_id === user.unitId) return 'resident';
    throw new ForbiddenException();
  }

  // Presigned PUT for a PQR photo. Client uploads, then passes the r2Key in `attachments`.
  async requestPhotoUrl(user: AuthUser, dto: PqrPhotoDto) {
    if (!dto.filename?.trim()) throw new BadRequestException('filename is required');
    const dbUser = await this.resolveUser(user.userId);
    const r2Key = `conjuntos/${dbUser.conjunto_id}/units/${user.unitId ?? 'common'}/pqr-photos/${randomUUID()}/${dto.filename.trim().replace(/[^\w.\-]+/g, '_')}`;
    const uploadUrl = await generatePresignedPutUrl(r2Key, imageContentType(dto.contentType));
    return { uploadUrl, r2Key, expiresInSeconds: 300 };
  }

  // Residents see their own unit's tickets; admins see everything in their conjunto.
  // Optional status filter (e.g. ?status=OPEN).
  // Staff see the tickets assigned to them (also admins with ?assigned=me).
  // Jefe de área with ?scope=team: every ticket assigned to a member of their team.
  // Admins can narrow by ?team= (area) and ?assignee= (users.id | 'none').
  async list(user: AuthUser, filters: PqrListFilters = {}): Promise<Pqr[]> {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const { status, assigned, scope, team, assignee } = filters;
    const where: Prisma.PqrWhereInput = { conjunto_id: user.conjuntoId };
    if ((team || assignee) && user.role !== 'ADMIN') throw new ForbiddenException();
    if (user.role === 'STAFF') {
      const me = await this.resolveUser(user.userId);
      if (scope === 'team') {
        const mine = leadTeam(me);
        if (!mine) throw new ForbiddenException('Solo el jefe de área ve las solicitudes del equipo');
        where.assigned_to = { is: teamWhere(user.conjuntoId, mine) };
      } else {
        where.assigned_to_id = me.id;
      }
    } else if (user.role === 'ADMIN') {
      if (assigned === 'me') where.assigned_to_id = (await this.resolveUser(user.userId)).id;
      else if (assignee === 'none') where.assigned_to_id = null;
      else if (assignee) where.assigned_to_id = assignee;
      if (team?.trim()) where.assigned_to = { is: teamWhere(user.conjuntoId, team) };
    } else {
      where.unit_id = user.role === 'RESIDENT' && user.unitId ? user.unitId : '__none__';
    }
    const ops = user.role === 'ADMIN' || user.role === 'STAFF';
    if (status === 'ACTIVE') where.status = { in: [PqrStatus.OPEN, PqrStatus.IN_REVIEW, PqrStatus.AWAITING_RESIDENT] };
    else if (status && status in PqrStatus) where.status = status as PqrStatus;
    return this.prisma.db.pqr.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 500,
      // Who holds it: only for the operations side (same query, no N+1).
      include: { unit: { select: { unit_number: true, tower: true } }, ...(ops ? { assigned_to: WHO } : {}) },
    });
  }

  async getOne(
    user: AuthUser,
    pqrId: string,
  ): Promise<Pqr & { comments: PqrComment[]; attachmentUrls: string[] }> {
    const found = await this.prisma.db.pqr.findUnique({
      where: { id: pqrId },
      include: {
        comments: { orderBy: { created_at: 'asc' } },
        unit: { select: { unit_number: true, tower: true } },
        assigned_to: WHO,
      },
    });
    const access = await this.access(user, found);
    // Residents don't get the assignee's name/team (unchanged for them).
    const pqr = access === 'resident' && found ? { ...found, assigned_to: undefined } : found;
    // Hide internal notes from residents (staff working the ticket see them).
    const comments = access === 'resident' ? pqr!.comments.filter((c) => !c.is_internal) : pqr!.comments;
    // Photos were stored but never shown to anyone — return short-lived URLs.
    const prefix = `conjuntos/${pqr!.conjunto_id}/units/`;
    const attachmentUrls = await Promise.all(
      pqr!.attachments
        .filter((k) => isKeyInPrefix(k, prefix))
        .map((k) => generatePresignedGetUrl(k, 300)),
    );
    return { ...pqr!, comments, attachmentUrls };
  }

  async updateStatus(user: AuthUser, pqrId: string, status: string): Promise<Pqr> {
    const next = parseStatus(status);
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    const access = await this.access(user, pqr);
    if (access === 'resident') throw new ForbiddenException();
    if (access === 'staff' && next === PqrStatus.CLOSED) throw new ForbiddenException('Solo administración cierra solicitudes');
    if (!pqr) throw new NotFoundException('PQR not found');
    if (!canTransition(pqr.status, next)) {
      throw new BadRequestException(`Cannot transition ${pqr.status} → ${next}`);
    }

    const now = new Date();
    const data: Prisma.PqrUpdateInput = { status: next };

    // First response = the first move off OPEN.
    if (pqr.status === PqrStatus.OPEN && pqr.first_responded_at == null) {
      data.first_responded_at = now;
    }
    // Entering AWAITING_RESIDENT pauses the SLA clock.
    if (next === PqrStatus.AWAITING_RESIDENT) {
      data.awaiting_since = now;
    }
    // Leaving AWAITING_RESIDENT: bank the paused time and push due dates forward
    // by the time that was left on the clock when it paused (business-hours aware).
    if (pqr.status === PqrStatus.AWAITING_RESIDENT && pqr.awaiting_since) {
      const delta = now.getTime() - pqr.awaiting_since.getTime();
      data.paused_ms = pqr.paused_ms + delta;
      data.awaiting_since = null;
      const { sla, businessHours } = await this.ops.loadConfig(pqr.conjunto_id);
      const target = sla[pqr.priority];
      const shift = (due: Date | null): Date | undefined => {
        if (!due) return undefined;
        if (!target.businessHours) return new Date(due.getTime() + delta);
        const left = businessMsBetween(pqr.awaiting_since!, due, businessHours);
        return due.getTime() <= pqr.awaiting_since!.getTime() ? due : addBusinessMs(now, left, businessHours);
      };
      if (pqr.first_responded_at == null) data.first_response_due_at = shift(pqr.first_response_due_at);
      data.resolution_due_at = shift(pqr.resolution_due_at);
    }
    if (next === PqrStatus.RESOLVED) {
      data.resolved_at = now;
      const due =
        (data.resolution_due_at as Date | undefined) ?? pqr.resolution_due_at ?? null;
      data.sla_breached = due ? now.getTime() > due.getTime() : false;
    }

    const updated = await this.prisma.db.pqr.update({ where: { id: pqrId }, data });

    // Fire-and-forget push notification. Never awaited and never throws into the
    // request — if Redis is absent the enqueue just fails silently (lazyConnect).
    void this.notifications
      .add(PQR_STATUS_CHANGED, {
        pqrId: updated.id,
        unitId: updated.unit_id,
        fromStatus: pqr.status,
        toStatus: next,
        title: updated.title,
      })
      .catch((err: unknown) =>
        this.logger.warn(`Failed to enqueue PQR notification: ${String(err)}`),
      );

    // Re-arm SLA escalation: a 24h resident-nudge cadence while paused, else an
    // immediate re-eval that reschedules to the next threshold.
    this.scheduleEscalation(updated.id, next === PqrStatus.AWAITING_RESIDENT ? 24 * HOUR_MS : 1000);

    return updated;
  }

  async addComment(user: AuthUser, pqrId: string, dto: AddCommentDto): Promise<PqrComment> {
    if (!dto.body?.trim()) throw new BadRequestException('body is required');
    const dbUser = await this.resolveUser(user.userId);
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    const access = await this.access(user, pqr);
    const isOps = access !== 'resident';
    const created = await this.prisma.db.pqrComment.create({
      data: {
        pqr_id: pqrId,
        author_id: dbUser.id,
        body: dto.body.trim().slice(0, 5000),
        // Only admins / assigned staff can leave internal notes.
        is_internal: isOps ? (dto.isInternal ?? false) : false,
      },
    });
    // A visible reply from the team counts as the first response.
    if (isOps && !created.is_internal && pqr!.first_responded_at == null) {
      await this.prisma.db.pqr.update({ where: { id: pqrId }, data: { first_responded_at: created.created_at } });
    }
    // Residents hear about replies; the assignee hears about resident replies.
    if (isOps && !created.is_internal && pqr!.unit_id) {
      void this.notifier
        .notifyUnitResidents(pqr!.unit_id, {
          type: 'pqr.comment',
          title: `Nueva respuesta en "${pqr!.title}"`,
          body: created.body.slice(0, 280),
          entityType: 'Pqr',
          entityId: pqrId,
          link: `/portal/solicitudes/${pqrId}`,
        })
        .catch(() => undefined);
    } else if (!isOps && pqr!.assigned_to_id) {
      void this.notifier
        .notifyUser({
          conjuntoId: pqr!.conjunto_id,
          userId: pqr!.assigned_to_id,
          type: 'pqr.comment',
          title: `El residente respondió en "${pqr!.title}"`,
          body: created.body.slice(0, 280),
          entityType: 'Pqr',
          entityId: pqrId,
          link: `/tareas/${pqrId}`,
        })
        .catch(() => undefined);
    }
    return created;
  }

  // Assign a ticket to a staff/admin user in the same conjunto.
  // A jefe de área can move a ticket of their team to another active member of that team.
  async assign(user: AuthUser, pqrId: string, assigneeUserId: string): Promise<Pqr> {
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') throw new ForbiddenException();
    if (!assigneeUserId) throw new BadRequestException('assigneeUserId is required');
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    const assignee = await this.prisma.db.user.findUnique({ where: { id: assigneeUserId } });
    if (user.role === 'STAFF') {
      const team = leadTeam(await this.resolveUser(user.userId));
      if (!team) throw new ForbiddenException();
      // The ticket must already be in the team (unassigned / other teams: admin only)…
      if (!pqr.assigned_to_id || !(await this.teamMember(pqr.conjunto_id, team, pqr.assigned_to_id))) {
        throw new ForbiddenException();
      }
      // …and stay in it.
      if (
        !assignee ||
        assignee.conjunto_id !== user.conjuntoId ||
        !assignee.is_active ||
        assignee.role !== UserRole.STAFF ||
        teamKey(assignee.team) !== teamKey(team)
      ) {
        throw new ForbiddenException('Solo puedes reasignar a personas activas de tu equipo');
      }
    }
    if (
      !assignee ||
      assignee.conjunto_id !== user.conjuntoId ||
      !assignee.is_active ||
      !ASSIGNABLE_ROLES.includes(assignee.role)
    ) {
      throw new BadRequestException('Solo se puede asignar a personal o administración');
    }
    const updated = await this.prisma.db.pqr.update({
      where: { id: pqrId },
      data: { assigned_to_id: assigneeUserId, escalation_level: 0 },
    });
    if (pqr.assigned_to_id !== assigneeUserId) this.notifyAssigned(updated, assigneeUserId);
    this.scheduleEscalation(updated.id, 1000);
    return updated;
  }

  // Change priority → recompute SLA due dates (preserving any banked pause time).
  async setPriority(user: AuthUser, pqrId: string, priorityRaw: string): Promise<Pqr> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const priority = parsePriority(priorityRaw);
    if (!priority) throw new BadRequestException(`Invalid priority: ${priorityRaw}`);
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    const { sla, businessHours } = await this.ops.loadConfig(pqr.conjunto_id);
    const target = sla[priority];
    // Due dates from creation under the new target, then pushed by banked pause time.
    const due = (hours: number) =>
      new Date(dueAfter(pqr.created_at, hours, target, businessHours).getTime() + pqr.paused_ms);
    const updated = await this.prisma.db.pqr.update({
      where: { id: pqrId },
      data: {
        priority,
        first_response_due_at: due(target.firstResponse),
        resolution_due_at: due(target.resolution),
        escalation_level: 0,
        sla_breached: false,
      },
    });
    this.scheduleEscalation(updated.id, 1000); // recompute thresholds for new priority
    return updated;
  }

  /** Is `userId` a STAFF member of `team` in this conjunto? (Inactive members count: their tickets need a new owner.) */
  private async teamMember(conjuntoId: string, team: string, userId: string): Promise<boolean> {
    const hit = await this.prisma.db.user.findFirst({
      where: { id: userId, ...teamWhere(conjuntoId, team) },
      select: { id: true },
    });
    return hit != null;
  }

  private async resolveUser(authUserId: string) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    return dbUser;
  }

  /** Exposed for EntryAuthorizationsService (same access rules as the ticket). */
  async accessFor(user: AuthUser, pqrId: string): Promise<{ pqr: Pqr; access: Access }> {
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    const access = await this.access(user, pqr);
    return { pqr: pqr!, access };
  }
}

/** The team a STAFF user leads, or null (not a lead, or lead without a team). */
function leadTeam(me: { role: UserRole; is_team_lead: boolean; team: string | null }): string | null {
  const team = me.team?.trim();
  return me.role === UserRole.STAFF && me.is_team_lead && team ? team : null;
}

function teamWhere(conjuntoId: string, team: string): Prisma.UserWhereInput {
  return { conjunto_id: conjuntoId, role: UserRole.STAFF, team: { equals: team.trim(), mode: 'insensitive' } };
}

function parseCategory(value: string): PqrCategory {
  if (value && value in PqrCategory) return value as PqrCategory;
  throw new BadRequestException(`Invalid category: ${value}`);
}

function parseStatus(value: string): PqrStatus {
  if (value && value in PqrStatus) return value as PqrStatus;
  throw new BadRequestException(`Invalid status: ${value}`);
}

function parsePriority(value: string | undefined): PqrPriority | null {
  return value && value in PqrPriority ? (value as PqrPriority) : null;
}

function parseScope(value: string | undefined): PqrScope | null {
  return value && value in PqrScope ? (value as PqrScope) : null;
}

// Photo uploads: only image types (a presigned PUT with text/html would let a
// user host arbitrary pages on the bucket domain).
function imageContentType(value: string | undefined): string {
  return value && /^image\/(jpeg|png|webp|heic|heif)$/.test(value) ? value : 'image/jpeg';
}
