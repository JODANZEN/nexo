// Phase 14 — Entitlements registry (shared by API guard + web nav gating).
// Backend `/me/entitlements` is the source of truth; the web only uses this to
// hide/lock UI. Keep feature keys stable — they're referenced in @RequiresFeature.

export type Tier = 'BASIC' | 'PRO' | 'PREMIUM';

export const TIER_RANK: Record<Tier, number> = { BASIC: 0, PRO: 1, PREMIUM: 2 };

/** feature key → minimum plan tier that includes it. */
export const FEATURE_MIN_TIER = {
  // ── BASIC (Esencial) — can't run a conjunto without these ──
  pagos: 'BASIC',
  pqr: 'BASIC',
  documentos: 'BASIC',
  comunidad: 'BASIC',
  anuncios: 'BASIC',
  porteria: 'BASIC',
  configuracion: 'BASIC',
  'contabilidad.lite': 'BASIC',
  // ── PRO (Profesional) ──
  asambleas: 'PRO',
  reservas: 'PRO',
  parqueaderos: 'PRO',
  inspecciones: 'PRO',
  reportes: 'PRO',
  'payments.recurring': 'PRO',
  iris: 'PRO',
  'contabilidad.completo': 'PRO',
  // ── PREMIUM ──
  'contabilidad.facturacion': 'PREMIUM',
  'contabilidad.nomina': 'PREMIUM',
  'contabilidad.exogena': 'PREMIUM',
  revisor_fiscal: 'PREMIUM',
  push: 'PREMIUM',
} as const satisfies Record<string, Tier>;

export type FeatureKey = keyof typeof FEATURE_MIN_TIER;

// Per-building overrides: `{ "asambleas": true }` or `{ "asambleas": { until: ISO } }`.
type Override = boolean | { until?: string };
type Overrides = Record<string, Override | undefined>;

/** True if `plan` includes `key`, or an un-expired override grants it. */
export function hasFeature(plan: Tier, overrides: unknown, key: FeatureKey): boolean {
  if (TIER_RANK[plan] >= TIER_RANK[FEATURE_MIN_TIER[key]]) return true;
  const ov = (overrides as Overrides | null | undefined)?.[key];
  if (ov === true) return true;
  if (ov && typeof ov === 'object' && ov.until) return new Date(ov.until).getTime() > Date.now();
  return false;
}

/** The full set of enabled feature keys for a conjunto. */
export function resolveEntitlements(plan: Tier, overrides: unknown): FeatureKey[] {
  return (Object.keys(FEATURE_MIN_TIER) as FeatureKey[]).filter((k) => hasFeature(plan, overrides, k));
}
