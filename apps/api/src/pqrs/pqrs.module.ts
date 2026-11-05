import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { PqrsController } from './pqrs.controller';
import { PqrsService } from './pqrs.service';
import { EscalationProcessor, ESCALATION_QUEUE } from './escalation.processor';

@Module({
  imports: [NotificationsModule, BullModule.registerQueue({ name: ESCALATION_QUEUE })],
  controllers: [PqrsController],
  providers: [PqrsService, EscalationProcessor],
})
export class PqrsModule {}
