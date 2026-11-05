import Decimal from 'decimal.js';

// Configure Decimal.js for COP: no scientific notation, round half up (banker's standard)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Apply a discount rate to a base amount.
 * Returns the discount amount (positive), not the discounted total.
 *
 * @example applyDiscount(350000, 0.05) → 17500
 */
export function applyDiscount(baseAmount: Decimal, rate: Decimal): Decimal {
  return baseAmount.mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Calculate Colombian daily mora (late fee).
 *
 * Colombia's Ley 675 allows conjuntos to set their own mora rate in the reglamento.
 * The rate stored in BillingPeriod.late_fee_rate is the MONTHLY rate.
 * Daily rate = monthly rate / 30 (Colombian convention, not actual days in month).
 *
 * @param baseAmount  The original unpaid charge (no discounts — mora accrues on full base)
 * @param monthlyRate Monthly mora rate (e.g., 0.015 = 1.5%)
 * @param daysLate    Number of calendar days past the due date (must be > 0)
 * @returns           Total accumulated mora amount in COP
 */
export function calculateMora(
  baseAmount: Decimal,
  monthlyRate: Decimal,
  daysLate: number,
): Decimal {
  if (daysLate <= 0) return new Decimal(0);
  const dailyRate = monthlyRate.div(30);
  return baseAmount
    .mul(dailyRate)
    .mul(daysLate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Format a Decimal as Colombian Pesos string.
 * @example formatCOP(332500) → "$ 332.500"
 */
export function formatCOP(amount: Decimal | number): string {
  const n = typeof amount === 'number' ? amount : amount.toNumber();
  return `$ ${n.toLocaleString('es-CO')}`;
}
