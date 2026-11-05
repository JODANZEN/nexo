import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { OnboardingService, type ProvisionDto } from './onboarding.service';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly onboarding: OnboardingService) {}

  // Provision (admin, with conjuntoId) or claim a pending resident invite (no body).
  @Post('provision')
  provision(@CurrentUser() user: AuthUser, @Body() dto: ProvisionDto) {
    return this.onboarding.provision(user, dto ?? {});
  }

  // Current user's profile (name, phone, unit number) for the portal.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.onboarding.me(user);
  }
}
