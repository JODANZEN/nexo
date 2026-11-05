import { Controller, ForbiddenException, Get, Param, UseGuards } from '@nestjs/common';
import type { BillingSnapshot } from '@nexo/types';
import { BillingService } from './billing.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertUnitAccess } from '../auth/unit-access';

@Controller('billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  // Admin cartera: all units in the conjunto with their current balance.
  @Get('units')
  async listUnits(@CurrentUser() user: AuthUser): Promise<BillingSnapshot[]> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return this.billing.listConjuntoBalances(user.conjuntoId);
  }

  // A resident may only read their own unit's balance; ADMIN reads any unit in
  // THEIR conjunto (never another tenant's).
  @Get('units/:unitId/balance')
  async getBalance(
    @Param('unitId') unitId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BillingSnapshot> {
    await assertUnitAccess(this.prisma, user, unitId);
    return this.billing.calculateCurrentBalance(unitId);
  }
}
