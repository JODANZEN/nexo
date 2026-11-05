import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PqrStatus, UserRole, type Pqr } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LAZY_WORKER_OPTS } from '../queue/worker-options';

export const ESCALATION_QUEUE = 'ticket-escalation';
export const EVALUATE = 'evaluate';

const HOUR_MS = 3_600_000;

/**
 * Self-rescheduling SLA escalation. On each evaluation it re-reads the ticket
 * (so it's correct after pauses shift due dates), acts on the current threshold,
 * and re-enqueues a delayed job for the next one:
 *   70% → nudge assignee · 90% → notify supervisors · 100% → breach + escalate.
 * While AWAITING_RESIDENT the SLA is paused; instead it nudges the resident and
 * re-checks in 24h. Duplicate in-flight jobs are safe — escalation_level is the
 * guard, so the same tier never fires twice.
 */
@Processor(ESCALATION_QUEUE, LAZY_WORKER_OPTS)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(ESCALATION_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ pqrId: string }>): Promise<void> {
    if (job.name !== EVALUATE) return;
    const pqr = await this.prisma.db.pqr.findUnique({ where: { id: job.data.pqrId } });
    if (!pqr) return;
    if (pqr.status === PqrStatus.RESOLVED || pqr.status === PqrStatus.CLOSED) return;
    if (pqr.escalation_level >= 3) return;

    // Paused on the resident → nudge them, don't advance the SLA. Re-check in 24h
    // (this also re-nudges on a 24h cadence while it stays blocked).
    if (pqr.status === PqrStatus.AWAITING_RESIDENT) {
      if (pqr.unit_id) {
        await this.notifications
          .notifyUnitResidents(pqr.unit_id, {
            type: 'pqr.nudge',
            title: `Tu solicitud "${pqr.title}" espera tu respuesta`,
            entityType: 'Pqr',
            entityId: pqr.id,
            link: `/portal/solicitudes/${pqr.id}`,
          })
          .catch(() => undefined);
      }
      await this.schedule(pqr.id, 24 * HOUR_MS);
      return;
    }

    if (!pqr.resolution_due_at) return; // no SLA to enforce
    const window = pqr.resolution_due_at.getTime() - pqr.created_at.getTime() - pqr.paused_ms;
    if (window <= 0) return;
    const elapsed = Date.now() - pqr.created_at.getTime() - pqr.paused_ms;
    const fraction = elapsed / window;

    let level = pqr.escalation_level;
    if (fraction >= 1 && level < 3) {
      level = 3;
      await this.notifyStaff(pqr, `⛔ SLA incumplido: "${pqr.title}"`);
    } else if (fraction >= 0.9 && level < 2) {
      level = 2;
      await this.notifyStaff(pqr, `⚠️ SLA al 90%: "${pqr.title}"`);
    } else if (fraction >= 0.7 && level < 1) {
      level = 1;
      await this.notifyAssignee(pqr, `⏰ SLA al 70%: "${pqr.title}"`);
    }

    if (level !== pqr.escalation_level) {
      await this.prisma.db.pqr.update({
        where: { id: pqr.id },
        data: { escalation_level: level, sla_breached: level >= 3 ? true : pqr.sla_breached },
      });
    }

    if (level < 3) {
      const nextFrac = level === 0 ? 0.7 : level === 1 ? 0.9 : 1;
      const nextAbs = pqr.resolution_due_at.getTime() - (1 - nextFrac) * window;
      await this.schedule(pqr.id, Math.max(60_000, nextAbs - Date.now()));
    }
  }

  private async schedule(pqrId: string, delayMs: number): Promise<void> {
    await this.queue
      .add(EVALUATE, { pqrId }, { delay: Math.round(delayMs), removeOnComplete: true, removeOnFail: true })
      .catch((err: unknown) => this.logger.warn(`escalation reschedule failed: ${String(err)}`));
  }

  private async notifyAssignee(pqr: Pqr, title: string): Promise<void> {
    if (pqr.assigned_to_id) {
      await this.notifications.notifyUser({
        conjuntoId: pqr.conjunto_id,
        userId: pqr.assigned_to_id,
        type: 'pqr.escalation',
        title,
        entityType: 'Pqr',
        entityId: pqr.id,
        link: `/dashboard/solicitudes/${pqr.id}`,
      });
    } else {
      await this.notifyStaff(pqr, title);
    }
  }

  private async notifyStaff(pqr: Pqr, title: string): Promise<void> {
    const admins = await this.prisma.db.user.findMany({
      where: { conjunto_id: pqr.conjunto_id, role: UserRole.ADMIN },
      select: { id: true },
    });
    for (const a of admins) {
      await this.notifications.notifyUser({
        conjuntoId: pqr.conjunto_id,
        userId: a.id,
        type: 'pqr.escalation',
        title,
        entityType: 'Pqr',
        entityId: pqr.id,
        link: `/dashboard/solicitudes/${pqr.id}`,
      });
    }
  }
}
