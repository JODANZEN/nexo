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

// SLA targets in hours per priority (first response / resolution). Defaults —
// tune per client in config once discovery gives real numbers.
const SLA_HOURS: Record<PqrPriority, { firstResponse: number; resolution: number }> = {
  P1: { firstResponse: 1, resolution: 4 },
  P2: { firstResponse: 4, resolution: 24 },
  P3: { firstResponse: 8, resolution: 72 },
  P4: { firstResponse: 24, resolution: 168 },
};
const HOUR_MS = 3_600_000;
export interface PqrPhotoDto {
  filename: string;
  contentType?: string;
}
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
      if (user.role !== 'ADMIN' && unitId !== user.unitId) throw new ForbiddenException();
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

    const priority = parsePriority(dto.priority) ?? PqrPriority.P3;
    const scope = parseScope(dto.scope) ?? PqrScope.IN_UNIT;
    const now = Date.now();
    const sla = SLA_HOURS[priority];

    const created = await this.prisma.db.pqr.create({
      data: {
        conjunto_id: dbUser.conjunto_id,
        unit_id: unitId,
        submitted_by_id: dbUser.id,
        category: parseCategory(dto.category),
        priority,
        scope,
        first_response_due_at: new Date(now + sla.firstResponse * HOUR_MS),
        resolution_due_at: new Date(now + sla.resolution * HOUR_MS),
        title: dto.title.trim(),
        description: dto.description.trim(),
        attachments,
      },
    });
    this.scheduleEscalation(created.id, 1000); // kick off SLA tracking
    return created;
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
  async list(user: AuthUser, status?: string): Promise<Pqr[]> {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const where: {
      conjunto_id?: string;
      unit_id?: string;
      status?: PqrStatus;
    } =
      user.role === 'ADMIN'
        ? { conjunto_id: user.conjuntoId ?? undefined }
        : { conjunto_id: user.conjuntoId ?? undefined, unit_id: user.unitId ?? '__none__' };
    if (status && status in PqrStatus) where.status = status as PqrStatus;
    return this.prisma.db.pqr.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  async getOne(
    user: AuthUser,
    pqrId: string,
  ): Promise<Pqr & { comments: PqrComment[]; attachmentUrls: string[] }> {
    const pqr = await this.prisma.db.pqr.findUnique({
      where: { id: pqrId },
      include: { comments: { orderBy: { created_at: 'asc' } } },
    });
    this.authorize(user, pqr);
    // Hide internal (admin-only) notes from residents.
    const comments =
      user.role === 'ADMIN' ? pqr!.comments : pqr!.comments.filter((c) => !c.is_internal);
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
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const next = parseStatus(status);
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
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
    // Leaving AWAITING_RESIDENT: bank the paused time and push due dates forward.
    if (pqr.status === PqrStatus.AWAITING_RESIDENT && pqr.awaiting_since) {
      const delta = now.getTime() - pqr.awaiting_since.getTime();
      data.paused_ms = pqr.paused_ms + delta;
      data.awaiting_since = null;
      if (pqr.first_response_due_at) {
        data.first_response_due_at = new Date(pqr.first_response_due_at.getTime() + delta);
      }
      if (pqr.resolution_due_at) {
        data.resolution_due_at = new Date(pqr.resolution_due_at.getTime() + delta);
      }
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
    this.authorize(user, pqr);
    return this.prisma.db.pqrComment.create({
      data: {
        pqr_id: pqrId,
        author_id: dbUser.id,
        body: dto.body.trim(),
        // Only admins can leave internal notes.
        is_internal: user.role === 'ADMIN' ? (dto.isInternal ?? false) : false,
      },
    });
  }

  // Assign a ticket to a staff/admin user in the same conjunto.
  async assign(user: AuthUser, pqrId: string, assigneeUserId: string): Promise<Pqr> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!assigneeUserId) throw new BadRequestException('assigneeUserId is required');
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    const assignee = await this.prisma.db.user.findUnique({ where: { id: assigneeUserId } });
    if (!assignee || assignee.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Assignee not found');
    }
    return this.prisma.db.pqr.update({
      where: { id: pqrId },
      data: { assigned_to_id: assigneeUserId },
    });
  }

  // Change priority → recompute SLA due dates (preserving any banked pause time).
  async setPriority(user: AuthUser, pqrId: string, priorityRaw: string): Promise<Pqr> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const priority = parsePriority(priorityRaw);
    if (!priority) throw new BadRequestException(`Invalid priority: ${priorityRaw}`);
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: pqrId } });
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    const sla = SLA_HOURS[priority];
    const base = pqr.created_at.getTime() + pqr.paused_ms;
    const updated = await this.prisma.db.pqr.update({
      where: { id: pqrId },
      data: {
        priority,
        first_response_due_at: new Date(base + sla.firstResponse * HOUR_MS),
        resolution_due_at: new Date(base + sla.resolution * HOUR_MS),
      },
    });
    this.scheduleEscalation(updated.id, 1000); // recompute thresholds for new priority
    return updated;
  }

  private async resolveUser(authUserId: string) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    return dbUser;
  }

  private authorize(user: AuthUser, pqr: Pqr | null): asserts pqr is Pqr {
    // 404 across tenants (don't leak existence); 403 for same-tenant wrong-unit residents.
    if (!pqr || pqr.conjunto_id !== user.conjuntoId) throw new NotFoundException('PQR not found');
    if (user.role !== 'ADMIN' && pqr.unit_id !== user.unitId) throw new ForbiddenException();
  }
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
