import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { InvitesService, type BulkInviteRow, type CreateInviteDto } from './invites.service';

@Controller('invites')
@UseGuards(ClerkAuthGuard)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.invites.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user, dto);
  }

  // Bulk residents: [{ unitNumber, phone, fullName?, occupancyType? }] — per-row result.
  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() body: { rows: BulkInviteRow[] }) {
    return this.invites.bulk(user, body?.rows);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invites.revoke(user, id);
  }
}
