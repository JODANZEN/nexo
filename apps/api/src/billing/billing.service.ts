// apps/api/src/billing/billing.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Decimal from 'decimal.js';
import { BillingSnapshot } from '@nexo/types';
import { daysFromDueDate, getBillingDates, nowInColombia } from '@nexo/utils';
import { applyDiscount, calculateMora } from '@nexo/utils';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the exact amount a unit owes at this moment in Colombian time.
   *
   * Timeline enforced:
   *   Days  1–10  (of billing month): PRONTO_PAGO — base amount minus discount rate
   *   Days 11–EOM:                    TARIFA_PLENA — base amount, no adjustment
   *   Days EOM+1 onward:              MORA — base amount plus daily accruing late fees
   *
   * If a unit has MULTIPLE unpaid charges (e.g., missed last month too),
   * each charge is evaluated independently against ITS OWN billing period.
   * This prevents applying pronto pago to an already-late charge.
   */
  // All units' balances for a conjunto (admin cartera table). Reuses the per-unit calc.
  async listConjuntoBalances(conjuntoId: string): Promise<BillingSnapshot[]> {
    const units = await this.prisma.db.unit.findMany({
      where: { conjunto_id: conjuntoId },
      select: { id: true },
      orderBy: { unit_number: 'asc' },
    });
    return Promise.all(units.map((u) => this.calculateCurrentBalance(u.id)));
  }

  async calculateCurrentBalance(unitId: string): Promise<BillingSnapshot> {
    // ── 1. Fetch unit with its conjunto config ──────────────────────────────
    const unit = await this.prisma.db.unit.findUnique({
      where: { id: unitId },
      include: {
        conjunto: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException(`Unit ${unitId} not found`);
    }

    // ── 2. Fetch ALL unpaid charges for this unit ───────────────────────────
    // We include the billing period to evaluate each charge's timeline.
    const unpaidCharges = await this.prisma.db.charge.findMany({
      where: {
        unit_id: unitId,
        // A charge is unpaid if its total_amount > paid_amount (or paid_amount is null)
        // We use a raw filter since Prisma doesn't support column-to-column comparison directly
        total_amount: { gt: 0 },
      },
      include: {
        billing_period: true,
      },
      orderBy: {
        billing_period: { period_year: 'asc' },
      },
    });

    // Filter to truly unpaid charges (paid_amount < total_amount)
    // paid_amount is added to Charge in an addendum to the schema
    const actuallyUnpaid = unpaidCharges.filter((charge) => {
      const paid = new Decimal(charge.paid_amount ?? 0);
      const total = new Decimal(charge.total_amount);
      return paid.lessThan(total);
    });

    if (actuallyUnpaid.length === 0) {
      // Unit is fully paid up — return a zero-balance snapshot
      return this.buildZeroBalanceSnapshot(unit);
    }

    const now = nowInColombia();

    // ── 3. Evaluate each charge independently ──────────────────────────────
    let totalBaseAmount = new Decimal(0);
    let totalDiscountAmount = new Decimal(0);
    let totalLateFeesAmount = new Decimal(0);

    // For the snapshot metadata, we report the CURRENT period's billing phase.
    // If there are multiple periods, we still show the current month's phase.
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Find the current period's charge (if it exists) for phase reporting
    const currentPeriodCharge = actuallyUnpaid.find(
      (c) =>
        c.billing_period.period_month === currentMonth &&
        c.billing_period.period_year === currentYear,
    );

    for (const charge of actuallyUnpaid) {
      const period = charge.billing_period;
      const alreadyPaid = new Decimal(charge.paid_amount ?? 0);
      const remainingBase = new Decimal(charge.total_amount).minus(alreadyPaid);

      const { prontoPagoDeadline, tarifaPlenaDeadline } = getBillingDates(
        period.period_month,
        period.period_year,
      );

      // How many days past the tarifa plena deadline? (i.e., past end of month)
      const daysLate = daysFromDueDate(tarifaPlenaDeadline);
      // How many days from the pronto pago deadline?
      const daysFromProntoPago = daysFromDueDate(prontoPagoDeadline);

      totalBaseAmount = totalBaseAmount.plus(remainingBase);

      if (daysFromProntoPago < 0) {
        // ── PRONTO PAGO: before or on day 10 of the billing month ────────
        // Apply discount to this charge
        const discountRate = new Decimal(period.pronto_pago_rate ?? 0);
        const discount = applyDiscount(remainingBase, discountRate);
        totalDiscountAmount = totalDiscountAmount.plus(discount);
        // No mora on a current-period charge
      } else if (daysLate <= 0) {
        // ── TARIFA PLENA: after day 10 but still within the month ────────
        // No discount, no mora. Pay base amount.
        // Nothing to add to totalDiscountAmount or totalLateFeesAmount
      } else {
        // ── MORA: past end of the billing month ──────────────────────────
        // Mora accrues on the ORIGINAL base amount, not the remaining (legal requirement)
        // This prevents a partial payment from resetting the mora base
        const moraBase = new Decimal(charge.base_amount);
        const monthlyMoraRate = new Decimal(period.late_fee_rate);
        const mora = calculateMora(moraBase, monthlyMoraRate, daysLate);
        totalLateFeesAmount = totalLateFeesAmount.plus(mora);
      }
    }

    // ── 4. Compute final amount due ─────────────────────────────────────────
    // totalDue = base - discounts + mora
    const totalDue = totalBaseAmount
      .minus(totalDiscountAmount)
      .plus(totalLateFeesAmount)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    // ── 5. Determine billing phase for the snapshot ─────────────────────────
    let billingPhase: BillingSnapshot['billingPhase'] = 'TARIFA_PLENA';
    let daysFromDue = 0;
    let dueDate = new Date();
    let discountDeadline = new Date();
    let prontoPagoRate = 0;
    let moraRate = 0;

    if (currentPeriodCharge) {
      const period = currentPeriodCharge.billing_period;
      const { prontoPagoDeadline, tarifaPlenaDeadline } = getBillingDates(
        period.period_month,
        period.period_year,
      );

      daysFromDue = daysFromDueDate(prontoPagoDeadline);
      dueDate = prontoPagoDeadline;
      discountDeadline = prontoPagoDeadline;
      prontoPagoRate = Number(period.pronto_pago_rate ?? 0);
      moraRate = Number(period.late_fee_rate);

      if (daysFromDue < 0) {
        billingPhase = 'PRONTO_PAGO';
      } else if (daysFromDueDate(tarifaPlenaDeadline) <= 0) {
        billingPhase = 'TARIFA_PLENA';
      } else {
        billingPhase = 'MORA';
      }
    } else {
      // No current period charge — all outstanding charges are from previous months
      // They are all in mora
      billingPhase = 'MORA';
    }

    // ── 6. Build the period label ───────────────────────────────────────────
    const periodLabel = currentPeriodCharge
      ? this.formatPeriodLabel(
          currentPeriodCharge.billing_period.period_month,
          currentPeriodCharge.billing_period.period_year,
        )
      : `Múltiples períodos (${actuallyUnpaid.length})`;

    // ── 7. Log balance check to audit_log ──────────────────────────────────
    // (non-blocking — don't await, balance check is read-only)
    this.prisma.db.auditLog
      .create({
        data: {
          conjunto_id: unit.conjunto_id,
          action: 'billing.balance_checked',
          entity_type: 'Unit',
          entity_id: unitId,
          metadata: {
            totalDue: totalDue.toString(),
            billingPhase,
            chargeCount: actuallyUnpaid.length,
          },
        },
      })
      .catch(() => {
        // Audit log failure should never break the billing query
      });

    // ── 8. Return the snapshot ──────────────────────────────────────────────
    return {
      unitId,
      unitNumber: unit.unit_number,
      billingPeriodId: currentPeriodCharge?.billing_period_id ?? '',
      periodLabel,
      baseAmount: totalBaseAmount.toNumber(),
      discountAmount: totalDiscountAmount.toNumber(),
      lateFeesAmount: totalLateFeesAmount.toNumber(),
      totalDue: totalDue.toNumber(),
      billingPhase,
      daysFromDueDate: daysFromDue,
      dueDate: dueDate.toISOString(),
      discountDeadline: discountDeadline.toISOString(),
      prontoPagoRate,
      moraRate,
      outstandingChargeIds: actuallyUnpaid.map((c) => c.id),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildZeroBalanceSnapshot(unit: { id: string; unit_number: string; conjunto_id: string }): BillingSnapshot {
    const now = nowInColombia();
    return {
      unitId: unit.id,
      unitNumber: unit.unit_number,
      billingPeriodId: '',
      periodLabel: '',
      baseAmount: 0,
      discountAmount: 0,
      lateFeesAmount: 0,
      totalDue: 0,
      billingPhase: 'TARIFA_PLENA',
      daysFromDueDate: 0,
      dueDate: now.toISOString(),
      discountDeadline: now.toISOString(),
      prontoPagoRate: 0,
      moraRate: 0,
      outstandingChargeIds: [],
    };
  }

  private formatPeriodLabel(month: number, year: number): string {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  /**
   * Generates ALL charges for a given conjunto for the current month.
   * Called by the monthly cron job on the 1st of each month.
   */
  async generateMonthlyCharges(conjuntoId: string): Promise<{ chargesCreated: number }> {
    const now = nowInColombia();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Idempotency: check if billing period already exists
    const existingPeriod = await this.prisma.db.billingPeriod.findUnique({
      where: {
        conjunto_id_period_month_period_year: {
          conjunto_id: conjuntoId,
          period_month: month,
          period_year: year,
        },
      },
    });

    if (existingPeriod) {
      throw new BadRequestException(
        `Billing period ${month}/${year} already exists for conjunto ${conjuntoId}`,
      );
    }

    // Fetch conjunto config for pronto pago rate
    // ponytail: Unit has no is_active flag in the blueprint schema — bill all units.
    const conjunto = await this.prisma.db.conjunto.findUnique({
      where: { id: conjuntoId },
      include: {
        units: {
          select: { id: true, monthly_fee: true },
        },
      },
    });

    if (!conjunto) throw new NotFoundException(`Conjunto ${conjuntoId} not found`);

    const { tarifaPlenaDeadline } = getBillingDates(month, year);

    // Create the billing period + all unit charges in one transaction
    const result = await this.prisma.db.$transaction(async (tx) => {
      const period = await tx.billingPeriod.create({
        data: {
          conjunto_id: conjuntoId,
          period_month: month,
          period_year: year,
          due_date: tarifaPlenaDeadline,
          // These rates come from conjunto config — add to Conjunto model
          late_fee_rate: conjunto.mora_rate ?? new Decimal('0.015'),
          pronto_pago_rate: conjunto.pronto_pago_rate ?? new Decimal('0.05'),
          is_closed: false,
        },
      });

      const charges = await tx.charge.createMany({
        data: conjunto.units.map((unit) => ({
          unit_id: unit.id,
          billing_period_id: period.id,
          base_amount: unit.monthly_fee,
          late_fee_amount: new Decimal(0),
          total_amount: unit.monthly_fee, // Will be recalculated dynamically by calculateCurrentBalance
          paid_amount: new Decimal(0),
        })),
      });

      return charges;
    });

    return { chargesCreated: result.count };
  }
}
