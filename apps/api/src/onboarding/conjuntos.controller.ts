import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { canCreateConjunto } from '../auth/platform';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { OnboardingService, type CreateConjuntoDto } from './onboarding.service';

@Controller('conjuntos')
@UseGuards(ClerkAuthGuard)
export class ConjuntosController {
  constructor(private readonly onboarding: OnboardingService) {}

  // Whether the signed-in user may create a conjunto (onboarding wizard vs. "ask
  // for an invite" screen).
  @Get('can-create')
  canCreate(@CurrentUser() user: AuthUser) {
    return { allowed: canCreateConjunto(user) };
  }

  // Closed by default: only the Nexo team (PLATFORM_ADMIN_USER_IDS) creates
  // conjuntos, unless ALLOW_SELF_SERVE_SIGNUP=true. Optional adminPhone invites the
  // client's administrator by phone instead of making the creator the admin.
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConjuntoDto) {
    if (!canCreateConjunto(user)) {
      throw new ForbiddenException(
        'Nexo se activa con una demo. Pide a la administración de tu conjunto que te invite.',
      );
    }
    return this.onboarding.createConjunto(dto, user);
  }
}
