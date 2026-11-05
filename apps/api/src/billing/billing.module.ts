import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingCronService } from './billing-cron.service';
import { AUTO_CHARGE_QUEUE } from '../payments/auto-charge.processor';

@Module({
  imports: [BullModule.registerQueue({ name: AUTO_CHARGE_QUEUE })],
  controllers: [BillingController],
  providers: [BillingService, BillingCronService],
  exports: [BillingService], // PaymentsModule (3.2) reuses calculateCurrentBalance
})
export class BillingModule {}
