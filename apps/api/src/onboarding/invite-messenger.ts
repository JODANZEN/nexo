import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioService } from '../integrations/twilio.service';
import { runAsTenant } from '../tenancy/tenant-context';

export interface InviteMessageJob {
  conjuntoId: string;
  userId: string;
  phone: string;
  text: string;
  /** The `invite_sent_at` value stamped when the job was queued (undone if the send fails). */
  stampedAt: Date;
}

/** Few parallel sends: a 1,500-row load must not burst the provider's rate limit. */
const CONCURRENCY = 2;

/**
 * Background sender for invitation messages. HTTP handlers only enqueue (O(1)); a
 * small in-process pool drains the queue, so a bulk load answers without waiting
 * for the provider.
 *
 * Deliberately NOT NotificationsService.notifyUser: that persists a row in the
 * person's in-app feed, and an "entra aquí" link is noise (and stale) once they
 * are inside. Invitations go straight to the channel adapter and leave only
 * `users.invite_sent_at` behind.
 *
 * In-memory on purpose (no Redis round-trips per message — Upstash is metered):
 * a restart drops whatever is still queued. Those invitations stay pending and
 * can be re-sent from the dashboard ("Reenviar").
 */
@Injectable()
export class InviteMessenger {
  private readonly logger = new Logger(InviteMessenger.name);
  private readonly queue: InviteMessageJob[] = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
  ) {}

  /** Automatic delivery needs a provider AND a public web URL to put in the message. */
  get enabled(): boolean {
    return this.twilio.configured && !!(process.env.APP_URL ?? '').trim();
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

  enqueue(job: InviteMessageJob): void {
    this.queue.push(job);
    this.pump();
  }

  /** Send now (single resend). Same failure handling as the queue. */
  async sendNow(job: InviteMessageJob, previous: Date | null): Promise<boolean> {
    return this.process(job, previous);
  }

  /** Resolves when nothing is queued or in flight (tests, graceful shutdown). */
  idle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      // setImmediate: never run a send inside the caller's stack / request.
      setImmediate(() => {
        void this.process(job, null).finally(() => {
          this.active--;
          this.pump();
          if (this.pending === 0) {
            const waiters = this.idleWaiters;
            this.idleWaiters = [];
            waiters.forEach((w) => w());
          }
        });
      });
    }
  }

  private async process(job: InviteMessageJob, previous: Date | null): Promise<boolean> {
    let ok = false;
    try {
      ok = await this.twilio.send(job.phone, job.text);
    } catch (err) {
      this.logger.warn(`Invite message error: ${String(err)}`);
    }
    if (ok) return true;
    this.logger.warn(`Invite message not delivered (invite ${job.userId})`);
    try {
      // Undo the "sent" stamp so the list is honest and the admin can retry right away.
      // The pool outlives the request that started it, so scope each write to the job's
      // own tenant explicitly instead of whatever async context the pool inherited.
      await runAsTenant(job.conjuntoId, () =>
        this.prisma.db.user.updateMany({
          where: { id: job.userId, conjunto_id: job.conjuntoId, invite_sent_at: job.stampedAt },
          data: { invite_sent_at: previous },
        }),
      );
    } catch (err) {
      this.logger.warn(`Could not clear invite_sent_at (invite ${job.userId}): ${String(err)}`);
    }
    return false;
  }
}
