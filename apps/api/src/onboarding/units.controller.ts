import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  OnboardingService,
  type InviteDto,
  type AssignResidentDto,
} from './onboarding.service';
import { UnitsService, type UnitInput } from './units.service';

@Controller('units')
@UseGuards(ClerkAuthGuard)
export class UnitsController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly units: UnitsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.units.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UnitInput) {
    return this.units.createOne(user, dto);
  }

  // CSV import: { rows: UnitInput[] } — upsert by unit number.
  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() body: { rows: UnitInput[] }) {
    return this.units.bulk(user, body?.rows);
  }

  @Patch(':unitId')
  update(@CurrentUser() user: AuthUser, @Param('unitId') unitId: string, @Body() dto: Partial<UnitInput>) {
    return this.units.update(user, unitId, dto);
  }

  @Post(':unitId/invite')
  invite(@CurrentUser() user: AuthUser, @Param('unitId') unitId: string, @Body() dto: InviteDto) {
    return this.onboarding.invite(user, unitId, dto);
  }

  // 11.9 — Admin assigns an existing Clerk user to this unit as RESIDENT.
  @Post(':unitId/assign-resident')
  assignResident(
    @CurrentUser() user: AuthUser,
    @Param('unitId') unitId: string,
    @Body() dto: AssignResidentDto,
  ) {
    return this.onboarding.assignResident(user, unitId, dto);
  }
}
