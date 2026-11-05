import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  VisitorsService,
  type GenerateQrDto,
  type ScanDto,
  type WalkinDto,
} from './visitors.service';

@Controller('visitors')
@UseGuards(ClerkAuthGuard)
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Post('qr')
  generateQr(@CurrentUser() user: AuthUser, @Body() dto: GenerateQrDto) {
    return this.visitors.generateQr(user, dto);
  }

  // The resident's own pre-authorized visitor QR codes.
  @Get('qr')
  listQr(@CurrentUser() user: AuthUser) {
    return this.visitors.listQrCodes(user);
  }

  @Post('scan')
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.visitors.scan(user, dto);
  }

  @Post('walkin')
  walkin(@CurrentUser() user: AuthUser, @Body() dto: WalkinDto) {
    return this.visitors.walkin(user, dto);
  }
}
