import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitorsController } from './visitors.controller';
import { VisitorsService } from './visitors.service';
import { VisitorPurgeService } from './visitor-purge.service';

@Module({
  imports: [NotificationsModule],
  controllers: [VisitorsController],
  providers: [VisitorsService, VisitorPurgeService],
})
export class VisitorsModule {}
