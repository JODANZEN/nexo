import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_MIN_TIER, hasFeature, type FeatureKey, type Tier } from '@nexo/types';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_KEY } from './requires-feature.decorator';
import type { AuthUser } from './auth.types';

/**
 * Enforces plan entitlements on routes decorated with @RequiresFeature.
 * Runs AFTER ClerkAuthGuard (needs req.user.conjuntoId). Ungated routes pass.
 * Denies with a structured 403 the web can act on: { code: 'PLAN_REQUIRED', ... }.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!feature) return true; // route not gated

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');

    const conjunto = await this.prisma.db.conjunto.findUnique({
      where: { id: user.conjuntoId },
      select: { plan: true, feature_overrides: true },
    });
    const plan = (conjunto?.plan ?? 'BASIC') as Tier;
    if (hasFeature(plan, conjunto?.feature_overrides, feature)) return true;

    throw new ForbiddenException({
      code: 'PLAN_REQUIRED',
      feature,
      minTier: FEATURE_MIN_TIER[feature],
      message: `Esta función requiere el plan ${FEATURE_MIN_TIER[feature]}.`,
    });
  }
}
