// Pricing decided 2026-07-12 (Phase 14 — Entitlements). COP per month, billed monthly.
// Unit ranges, not per-door: administrations budget a fixed monthly amount.

export type PlanId = "basico" | "pro" | "premium";
export type RangeId = "1-50" | "51-150" | "151-300" | "301-600" | "601+";

export const ranges: { id: RangeId; min: number; max: number | null }[] = [
  { id: "1-50", min: 1, max: 50 },
  { id: "51-150", min: 51, max: 150 },
  { id: "151-300", min: 151, max: 300 },
  { id: "301-600", min: 301, max: 600 },
  { id: "601+", min: 601, max: null },
];

// null = custom quote
export const prices: Record<RangeId, Record<PlanId, number | null>> = {
  "1-50": { basico: 89_000, pro: 159_000, premium: 289_000 },
  "51-150": { basico: 129_000, pro: 219_000, premium: 389_000 },
  "151-300": { basico: 179_000, pro: 299_000, premium: 489_000 },
  "301-600": { basico: 229_000, pro: 389_000, premium: 649_000 },
  "601+": { basico: null, pro: null, premium: null },
};

export const ANNUAL_DISCOUNT = 0.15;

export function monthlyPrice(range: RangeId, plan: PlanId, annual: boolean): number | null {
  const base = prices[range][plan];
  if (base === null) return null;
  // Integer math in pesos; round to the nearest 50 COP for display.
  return annual ? Math.round((base * (1 - ANNUAL_DISCOUNT)) / 50) * 50 : base;
}

export function formatCOP(value: number): string {
  // es-CO renders "$ 129.000"
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
