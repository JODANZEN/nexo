import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Habeas Data (Ley 1581/2012): visitor logs carry names and encrypted cédulas and
 * must not be kept indefinitely. Every row has `purge_after` (= created + 30 days)
 * but no job ever deleted them. This runs nightly at 03:00 COT.
 */
@Injectable()
export class VisitorPurgeService {
  private readonly logger = new Logger(VisitorPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { timeZone: 'America/Bogota' })
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.db.visitorLog.deleteMany({
      where: { purge_after: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Purged ${count} visitor logs past their 30-day retention`);
    return count;
  }
}
