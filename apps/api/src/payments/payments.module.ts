import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingModule } from '../billing/billing.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WompiReconcileProcessor, PAYMENTS_QUEUE } from './wompi-reconcile.processor';
import { AutoChargeProcessor, AUTO_CHARGE_QUEUE } from './auto-charge.processor';

@Module({
  imports: [
    BillingModule, // reuse calculateCurrentBalance()
    BullModule.registerQueue({ name: PAYMENTS_QUEUE }, { name: AUTO_CHARGE_QUEUE }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, WompiReconcileProcessor, AutoChargeProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
