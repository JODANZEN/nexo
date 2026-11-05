import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { TraceabilityService } from './traceability.service';

@Controller('traceability')
@UseGuards(ClerkAuthGuard)
export class TraceabilityController {
  constructor(private readonly traceability: TraceabilityService) {}

  @Get('units/:unitId')
  unitTimeline(@Param('unitId') unitId: string, @CurrentUser() user: AuthUser) {
    return this.traceability.unitTimeline(user, unitId);
  }
}
