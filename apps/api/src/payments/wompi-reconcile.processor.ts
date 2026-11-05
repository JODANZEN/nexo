import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { formatCOP } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import { LAZY_WORKER_OPTS } from '../queue/worker-options';
import { settleChargesForPayment } from './settle-charges';

export const PAYMENTS_QUEUE = 'payments';
export const RECONCILE_WOMPI = 'reconcile-wompi';

interface WompiTransaction {
  id: string;
  reference: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';
  amount_in_cents: number;
  currency: string;
  payment_link_id?: string | null;
}
type WompiWebhook = { data: { transaction: WompiTransaction } };

@Processor(PAYMENTS_QUEUE, LAZY_WORKER_OPTS)
export class WompiReconcileProcessor extends WorkerHost {
  private readonly logger = new Logger(WompiReconcileProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WompiWebhook>): Promise<void> {
    if (job.name !== RECONCILE_WOMPI) return;

    const { transaction } = job.data.data;
    const { reference, status, amount_in_cents, id: gatewayRef } = transaction;

    // 1. Idempotency — skip if this gateway txn was already settled.
    const existing = await this.prisma.db.payment.findUnique({
      where: { gateway_reference: gatewayRef },
    });
    if (existing?.status === 'PAID') return;

    // 2. Find the Payment: auto-charges store the Wompi transaction id; payment
    //    links store our own reference. Exact match only (no `contains`).
    const payment =
      existing ??
      (transaction.payment_link_id
        ? await this.prisma.db.payment.findFirst({
            where: { gateway_reference: `link_${transaction.payment_link_id}` },
          })
        : null) ??
      (await this.prisma.db.payment.findFirst({
        where: { gateway_reference: reference },
      }));
    if (!payment) throw new Error(`Payment not found for reference: ${reference}`);

    // 3. Amount check — reject partial/mismatched amounts.
    const expectedCents = Math.round(Number(payment.amount) * 100);
    if (amount_in_cents !== expectedCents) {
      this.logger.error(
        `Amount mismatch for payment ${payment.id}: expected ${expectedCents}, got ${amount_in_cents}`,
      );
      return;
    }

    // 4. Update Payment + Charge atomically.
    const approved = status === 'APPROVED';
    await this.prisma.db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: approved ? 'PAID' : 'FAILED',
          gateway_reference: gatewayRef,
          paid_at: approved ? new Date() : null,
          gateway_payload: transaction as object,
        },
      });
      if (approved) await settleChargesForPayment(tx, payment.unit_id, payment.created_at);
    });

    // 5. Notify resident (push notification stub).
    if (approved) {
      this.logger.log(
        `[push stub] ✅ Pago recibido — unit ${payment.unit_id}: ${formatCOP(Number(payment.amount))}`,
      );
    }
  }
}
