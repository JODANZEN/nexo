// Per-client ticket targets + business hours (2026-11).
// Colombia is UTC-5 all year (no DST), so "local" time is UTC shifted by 5 h.
// Import from origin (@prisma/client) so this file's self-check is node-runnable.
import type { PqrPriority } from '@prisma/client';

export interface SlaTarget {
  firstResponse: number; // hours
  resolution: number; // hours
  businessHours: boolean; // count only business hours (false = 24/7)
}
export type SlaConfig = Record<PqrPriority, SlaTarget>;

export interface BusinessHours {
  days: number[]; // 0 = domingo … 6 = sábado
  start: string; // "HH:MM" local (COT)
  end: string; // "HH:MM" local (COT)
  holidays: string[]; // extra non-working days "YYYY-MM-DD"
  nationalHolidays: boolean; // skip Colombian festivos automatically
}

export const DEFAULT_SLA: SlaConfig = {
  P1: { firstResponse: 1, resolution: 4, businessHours: false },
  P2: { firstResponse: 4, resolution: 24, businessHours: false },
  P3: { firstResponse: 8, resolution: 72, businessHours: false },
  P4: { firstResponse: 24, resolution: 168, businessHours: false },
};
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5, 6],
  start: '08:00',
  end: '18:00',
  holidays: [],
  nationalHolidays: true,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const COT_OFFSET_MS = 5 * HOUR_MS;
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

function num(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? n : fallback;
}
function hhmm(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

/** Merge stored JSON with defaults; ignores anything malformed. */
export function resolveSla(raw: unknown): SlaConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Partial<SlaTarget>>;
  const out = {} as SlaConfig;
  for (const p of PRIORITIES) {
    const d = DEFAULT_SLA[p];
    const s = src[p] ?? {};
    const resolution = num(s.resolution, d.resolution, 24 * 90);
    out[p] = {
      firstResponse: Math.min(num(s.firstResponse, d.firstResponse, 24 * 30), resolution),
      resolution,
      businessHours: typeof s.businessHours === 'boolean' ? s.businessHours : d.businessHours,
    };
  }
  return out;
}

export function resolveBusinessHours(raw: unknown): BusinessHours {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<BusinessHours>;
  const days = Array.isArray(src.days)
    ? [...new Set(src.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : DEFAULT_BUSINESS_HOURS.days;
  let start = hhmm(src.start, DEFAULT_BUSINESS_HOURS.start);
  let end = hhmm(src.end, DEFAULT_BUSINESS_HOURS.end);
  if (minutes(end) <= minutes(start)) {
    start = DEFAULT_BUSINESS_HOURS.start;
    end = DEFAULT_BUSINESS_HOURS.end;
  }
  const holidays = Array.isArray(src.holidays)
    ? src.holidays.filter((h): h is string => typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h)).slice(0, 200)
    : [];
  return {
    days: days.length ? days : DEFAULT_BUSINESS_HOURS.days,
    start,
    end,
    holidays,
    nationalHolidays: typeof src.nationalHolidays === 'boolean' ? src.nationalHolidays : true,
  };
}

// ── Colombian festivos (Ley 51 de 1983 "Ley Emiliani") ──────────────────────

function ymd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}
function nextMonday(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const add = (8 - dt.getUTCDay()) % 7; // 0 if already Monday
  dt.setUTCDate(dt.getUTCDate() + add);
  return dt.toISOString().slice(0, 10);
}
function easter(y: number): Date {
  // Anonymous Gregorian algorithm.
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const holidayCache = new Map<number, Set<string>>();
export function colombianHolidays(y: number): Set<string> {
  const cached = holidayCache.get(y);
  if (cached) return cached;
  const e = easter(y);
  const rel = (days: number, monday = false) => {
    const dt = new Date(e.getTime() + days * DAY_MS);
    const [yy, mm, dd] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    return monday ? nextMonday(yy, mm, dd) : ymd(yy, mm, dd);
  };
  const set = new Set<string>([
    ymd(y, 1, 1), ymd(y, 5, 1), ymd(y, 7, 20), ymd(y, 8, 7), ymd(y, 12, 8), ymd(y, 12, 25),
    nextMonday(y, 1, 6), nextMonday(y, 3, 19), nextMonday(y, 6, 29), nextMonday(y, 8, 15),
    nextMonday(y, 10, 12), nextMonday(y, 11, 1), nextMonday(y, 11, 11),
    rel(-3), rel(-2), // Jueves y Viernes Santo
    rel(39, true), rel(60, true), rel(68, true), // Ascensión, Corpus Christi, Sagrado Corazón
  ]);
  holidayCache.set(y, set);
  return set;
}

// ── Business-time arithmetic ────────────────────────────────────────────────

/** Working window [start, end) in UTC ms for the local (COT) day containing `localDayStart`. */
function windowFor(localDayStartUtc: number, bh: BusinessHours): [number, number] | null {
  const local = new Date(localDayStartUtc - COT_OFFSET_MS);
  const key = local.toISOString().slice(0, 10);
  if (!bh.days.includes(local.getUTCDay())) return null;
  if (bh.holidays.includes(key)) return null;
  if (bh.nationalHolidays && colombianHolidays(local.getUTCFullYear()).has(key)) return null;
  return [localDayStartUtc + minutes(bh.start) * 60_000, localDayStartUtc + minutes(bh.end) * 60_000];
}
/** UTC ms of local (COT) midnight for the day containing `t`. */
function localMidnight(t: number): number {
  const local = t - COT_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) + COT_OFFSET_MS;
}

/** start + `ms` of business time. */
export function addBusinessMs(start: Date, ms: number, bh: BusinessHours): Date {
  let remaining = Math.max(0, ms);
  let day = localMidnight(start.getTime());
  let cursor = start.getTime();
  for (let i = 0; i < 1000; i++) {
    const w = windowFor(day, bh);
    if (w) {
      const from = Math.max(cursor, w[0]);
      if (from < w[1]) {
        const avail = w[1] - from;
        if (remaining <= avail) return new Date(from + remaining);
        remaining -= avail;
      }
    }
    day += DAY_MS;
    cursor = day;
  }
  return new Date(cursor + remaining); // config with no working days: fall back to calendar
}

/** Business time between a and b (0 if b ≤ a). */
export function businessMsBetween(a: Date, b: Date, bh: BusinessHours): number {
  const end = b.getTime();
  let total = 0;
  let day = localMidnight(a.getTime());
  let cursor = a.getTime();
  for (let i = 0; i < 1000 && cursor < end; i++) {
    const w = windowFor(day, bh);
    if (w) {
      const from = Math.max(cursor, w[0]);
      const to = Math.min(end, w[1]);
      if (to > from) total += to - from;
    }
    day += DAY_MS;
    cursor = day;
  }
  return total;
}

/** Due date `hours` after `start` under `target`'s clock (business or 24/7). */
export function dueAfter(start: Date, hours: number, target: SlaTarget, bh: BusinessHours): Date {
  const ms = hours * HOUR_MS;
  return target.businessHours ? addBusinessMs(start, ms, bh) : new Date(start.getTime() + ms);
}

/** Time left on `target`'s clock from `now` until `due` (negative when overdue, 24/7 only). */
export function remainingMs(now: Date, due: Date, target: SlaTarget, bh: BusinessHours): number {
  if (!target.businessHours) return due.getTime() - now.getTime();
  return due.getTime() <= now.getTime() ? due.getTime() - now.getTime() : businessMsBetween(now, due, bh);
}

// Self-check: node dist/pqrs/sla.js
if (require.main === module) {
  const assert = require('node:assert') as typeof import('node:assert');
  const bh = resolveBusinessHours({ days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' });
  // 2026-11-06 is a Friday. 17:00 COT = 22:00Z. +4 business hours → Mon 2026-11-09 11:00 COT…
  // but 2026-11-09 is not a festivo; 2026-11-16 is (Independencia de Cartagena moved).
  const fri17 = new Date('2026-11-06T22:00:00Z');
  assert.equal(addBusinessMs(fri17, 4 * HOUR_MS, bh).toISOString(), '2026-11-09T16:00:00.000Z');
  assert.equal(businessMsBetween(fri17, new Date('2026-11-09T16:00:00Z'), bh), 4 * HOUR_MS);
  // Festivos 2026: Corpus Christi moved to Mon 2026-06-08, Ascensión Mon 2026-05-18.
  const h26 = colombianHolidays(2026);
  for (const d of ['2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-18', '2026-06-08', '2026-06-15', '2026-11-16', '2026-12-08']) {
    assert.equal(h26.has(d), true, d);
  }
  // Mon 2026-11-16 08:00 COT is a holiday → next window Tue.
  assert.equal(addBusinessMs(new Date('2026-11-16T13:00:00Z'), HOUR_MS, bh).toISOString(), '2026-11-17T14:00:00.000Z');
  assert.equal(resolveSla({ P1: { resolution: 2, firstResponse: 5 } }).P1.firstResponse, 2);
  console.log('sla self-check passed');
}
