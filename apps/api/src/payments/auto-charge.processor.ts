import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { LAZY_WORKER_OPTS } from '../queue/worker-options';

export const AUTO_CHARGE_QUEUE = 'auto-charge';
export const AUTO_CHARGE = 'auto-charge';

interface AutoChargeJob {
  conjuntoId: string;
  billingMonth: number;
  billingYear: number;
}

@Processor(AUTO_CHARGE_QUEUE, LAZY_WORKER_OPTS)
export class AutoChargeProcessor extends WorkerHost {
  private readonly logger = new Logger(AutoChargeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {
    super();
  }

  async process(job: Job<AutoChargeJob>): Promise<void> {
    if (job.name !== AUTO_CHARGE) return;
    const { conjuntoId, billingMonth, billingYear } = job.data;

    const mandates = await this.prisma.db.recurringMandate.findMany({
      where: { conjunto_id: conjuntoId, status: 'ACTIVE' },
    });

    let charged = 0;
    let failed = 0;
    for (const mandate of mandates) {
      try {
        const result = await this.payments.autoChargeUnit(mandate, billingMonth, billingYear);
        if (result === 'charged') charged += 1;
        else if (result === 'failed') failed += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(`Auto-charge failed for unit ${mandate.unit_id}: ${String(err)}`);
      }
    }

    this.logger.log(
      `Auto-charge ${conjuntoId} ${billingMonth}/${billingYear}: ${charged} charged, ${failed} failed, ${mandates.length} mandates`,
    );
  }
}
