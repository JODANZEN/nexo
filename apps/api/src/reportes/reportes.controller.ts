import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ReportesService } from './reportes.service';

@Controller('reportes')
@UseGuards(ClerkAuthGuard)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.reportes.overview(user);
  }
}
