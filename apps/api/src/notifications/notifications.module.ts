import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsProcessor, NOTIFICATIONS_QUEUE } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

const queue = BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE });

// Shared by PQR, Visitors, etc. Importers get the queue provider for @InjectQueue
// and the NotificationsService for persisted/multi-channel delivery.
@Module({
  imports: [queue],
  controllers: [NotificationsController],
  providers: [NotificationsProcessor, NotificationsService],
  exports: [queue, NotificationsService],
})
export class NotificationsModule {}
