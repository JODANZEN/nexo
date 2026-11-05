import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { nowInColombia } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { AUTO_CHARGE_QUEUE, AUTO_CHARGE } from '../payments/auto-charge.processor';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @InjectQueue(AUTO_CHARGE_QUEUE) private readonly autoCharge: Queue,
  ) {}

  // Day 1 of each month at 00:10 COT — create the month's cuota for every unit.
  // generateMonthlyCharges() existed but nothing ever called it, so in production
  // no monthly charges were being generated. Idempotent per conjunto/month.
  // Set BILLING_CRON_ENABLED=false to turn off (e.g. a demo environment).
  @Cron('10 0 1 * *', { timeZone: 'America/Bogota' })
  async runMonthlyCharges(): Promise<void> {
    if (process.env.BILLING_CRON_ENABLED === 'false') return;
    const conjuntos = await this.prisma.db.conjunto.findMany({ select: { id: true } });
    let created = 0;
    for (const c of conjuntos) {
      try {
        created += (await this.billing.generateMonthlyCharges(c.id)).chargesCreated;
      } catch (err) {
        // "already exists" for this month is expected on a re-run; log anything else.
        this.logger.warn(`Monthly charges skipped for ${c.id}: ${String(err)}`);
      }
    }
    this.logger.log(`Monthly charges: ${created} created across ${conjuntos.length} conjuntos`);
  }

  // Day 1 of each month at 06:00 COT — enqueue an auto-charge run per conjunto.
  @Cron('0 6 1 * *', { timeZone: 'America/Bogota' })
  async runMonthlyAutoCharge(): Promise<void> {
    const now = nowInColombia();
    const billingMonth = now.getMonth() + 1;
    const billingYear = now.getFullYear();

    const conjuntos = await this.prisma.db.conjunto.findMany({ select: { id: true } });
    for (const c of conjuntos) {
      await this.autoCharge.add(AUTO_CHARGE, {
        conjuntoId: c.id,
        billingMonth,
        billingYear,
      });
    }
    this.logger.log(
      `Enqueued auto-charge for ${conjuntos.length} conjuntos (${billingMonth}/${billingYear})`,
    );
  }
}
