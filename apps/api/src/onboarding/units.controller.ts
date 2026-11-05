import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  OnboardingService,
  type InviteDto,
  type AssignResidentDto,
} from './onboarding.service';

@Controller('units')
@UseGuards(ClerkAuthGuard)
export class UnitsController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.onboarding.listUnits(user);
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
