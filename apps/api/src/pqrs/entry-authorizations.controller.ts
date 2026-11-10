import { Throttle } from '@nestjs/throttler';
import { PUBLIC_LINK_LIMIT_PER_MIN } from '../security/throttling';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { EntryAuthorizationsService, type RequestEntryDto } from './entry-authorizations.service';

@Controller()
export class EntryAuthorizationsController {
  constructor(private readonly entries: EntryAuthorizationsService) {}

  @Post('pqrs/:pqrId/entry-authorizations')
  @UseGuards(ClerkAuthGuard)
  request(@CurrentUser() user: AuthUser, @Param('pqrId') pqrId: string, @Body() dto: RequestEntryDto) {
    return this.entries.request(user, pqrId, dto);
  }

  @Get('pqrs/:pqrId/entry-authorizations')
  @UseGuards(ClerkAuthGuard)
  listForTicket(@CurrentUser() user: AuthUser, @Param('pqrId') pqrId: string) {
    return this.entries.listForTicket(user, pqrId);
  }

  // Portería: approved entries for now / the next 24 h.
  @Get('entry-authorizations/active')
  @UseGuards(ClerkAuthGuard)
  active(@CurrentUser() user: AuthUser) {
    return this.entries.active(user);
  }

  @Post('entry-authorizations/:id/decision')
  @UseGuards(ClerkAuthGuard)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { approve: boolean; note?: string }) {
    return this.entries.decide(user, id, body?.approve === true, body?.note);
  }

  @Post('entry-authorizations/:id/use')
  @UseGuards(ClerkAuthGuard)
  use(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.entries.markUsed(user, id);
  }

  @Post('entry-authorizations/:id/cancel')
  @UseGuards(ClerkAuthGuard)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.entries.cancel(user, id);
  }

  // One-time link from SMS/WhatsApp — no login. The 192-bit token is the credential.
  @Throttle({ ip: { limit: PUBLIC_LINK_LIMIT_PER_MIN, ttl: 60_000 } })
  @Get('public/entry-authorizations/:token')
  publicView(@Param('token') token: string) {
    return this.entries.publicView(token);
  }

  @Throttle({ ip: { limit: PUBLIC_LINK_LIMIT_PER_MIN, ttl: 60_000 } })
  @Post('public/entry-authorizations/:token')
  publicDecide(@Param('token') token: string, @Body() body: { approve: boolean; note?: string }) {
    return this.entries.publicDecide(token, body?.approve === true, body?.note);
  }
}
