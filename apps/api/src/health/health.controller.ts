import { SkipThrottle } from '@nestjs/throttler';
import { SKIP_ALL } from '../security/throttling';
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@SkipThrottle(SKIP_ALL)
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/health — liveness + DB connectivity probe. */
  @Get()
  async check(): Promise<{ status: string; db: string; timestamp: string }> {
    let db = 'disconnected';
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {
      db = 'disconnected';
    }

    return {
      status: 'ok',
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
