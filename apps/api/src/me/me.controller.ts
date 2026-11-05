import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { resolveEntitlements, type Tier } from '@nexo/types';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/me — protected test route; echoes the authenticated user. */
  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /** GET /api/me/entitlements — the conjunto's plan + enabled feature keys.
   *  Source of truth for the web's useEntitlements() (no Clerk mirror). */
  @Get('entitlements')
  async entitlements(@CurrentUser() user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const conjunto = await this.prisma.db.conjunto.findUnique({
      where: { id: user.conjuntoId },
      select: { plan: true, plan_status: true, feature_overrides: true },
    });
    const plan = (conjunto?.plan ?? 'BASIC') as Tier;
    return {
      plan,
      planStatus: conjunto?.plan_status ?? 'ACTIVE',
      features: resolveEntitlements(plan, conjunto?.feature_overrides),
    };
  }
}
