import { ForbiddenException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { calculateMora, daysFromDueDate, getBillingDates, nowInColombia } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const conjuntoId = user.conjuntoId;
    const now = nowInColombia();

    // ── Recaudo (current month) ──
    const period = await this.prisma.db.billingPeriod.findUnique({
      where: {
        conjunto_id_period_month_period_year: {
          conjunto_id: conjuntoId,
          period_month: now.getMonth() + 1,
          period_year: now.getFullYear(),
        },
      },
      include: { charges: { select: { total_amount: true, paid_amount: true } } },
    });
    let charged = new Decimal(0);
    let collected = new Decimal(0);
    for (const c of period?.charges ?? []) {
      charged = charged.plus(new Decimal(c.total_amount));
      collected = collected.plus(new Decimal(c.paid_amount));
    }
    const pct = charged.greaterThan(0)
      ? collected.div(charged).mul(100).toDecimalPlaces(1).toNumber()
      : 0;

    // ── PQR by status ──
    const pqrs = await this.prisma.db.pqr.groupBy({
      by: ['status'],
      where: { conjunto_id: conjuntoId },
      _count: { _all: true },
    });
    const pqrCounts = { OPEN: 0, IN_REVIEW: 0, RESOLVED: 0, CLOSED: 0 } as Record<string, number>;
    let pqrTotal = 0;
    for (const row of pqrs) {
      pqrCounts[row.status] = row._count._all;
      pqrTotal += row._count._all;
    }

    // ── Mora aging ── over all unpaid charges past the tarifa-plena deadline.
    const unpaid = await this.prisma.db.charge.findMany({
      where: { unit: { conjunto_id: conjuntoId } },
      include: { billing_period: true },
    });
    const moraUnits = new Set<string>();
    let totalMora = new Decimal(0);
    for (const charge of unpaid) {
      const remaining = new Decimal(charge.total_amount).minus(new Decimal(charge.paid_amount));
      if (remaining.lessThanOrEqualTo(0)) continue;
      const { tarifaPlenaDeadline } = getBillingDates(
        charge.billing_period.period_month,
        charge.billing_period.period_year,
      );
      const daysLate = daysFromDueDate(tarifaPlenaDeadline);
      if (daysLate <= 0) continue;
      moraUnits.add(charge.unit_id);
      totalMora = totalMora.plus(
        calculateMora(new Decimal(charge.base_amount), new Decimal(charge.billing_period.late_fee_rate), daysLate),
      );
    }

    return {
      recaudoMes: {
        charged: charged.toNumber(),
        collected: collected.toNumber(),
        pct,
        periodLabel: period
          ? `${now.getMonth() + 1}/${now.getFullYear()}`
          : 'Sin período activo',
      },
      pqr: { ...pqrCounts, total: pqrTotal },
      moraAging: {
        unitsInMora: moraUnits.size,
        totalMora: totalMora.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      },
    };
  }
}
