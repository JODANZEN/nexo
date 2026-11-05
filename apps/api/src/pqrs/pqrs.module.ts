import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { PqrsController } from './pqrs.controller';
import { PqrsService } from './pqrs.service';
import { EscalationProcessor, ESCALATION_QUEUE } from './escalation.processor';
import { OperationsService } from './operations.service';
import { RoutingService } from './routing.service';
import { EntryAuthorizationsService } from './entry-authorizations.service';
import { MaintenanceService } from './maintenance.service';
import { OperationsController } from './operations.controller';
import { EntryAuthorizationsController } from './entry-authorizations.controller';

@Module({
  imports: [NotificationsModule, BullModule.registerQueue({ name: ESCALATION_QUEUE })],
  controllers: [PqrsController, OperationsController, EntryAuthorizationsController],
  providers: [
    PqrsService,
    EscalationProcessor,
    OperationsService,
    RoutingService,
    EntryAuthorizationsService,
    MaintenanceService,
  ],
})
export class PqrsModule {}
