import { TZDate } from '@date-fns/tz';
import { differenceInDays, startOfDay } from 'date-fns';

export const COT_TIMEZONE = 'America/Bogota'; // UTC-5, no DST

/**
 * Returns the current date/time in Colombian time (COT).
 * All billing calculations must use this — never `new Date()` directly.
 */
export function nowInColombia(): Date {
  return new TZDate(new Date(), COT_TIMEZONE);
}

/**
 * Returns day-of-month in Colombian time (1–31).
 */
export function dayOfMonthCOT(date: Date = new Date()): number {
  return new TZDate(date, COT_TIMEZONE).getDate();
}

/**
 * Calculates how many calendar days have passed since the due date.
 * Positive = days PAST due (mora territory).
 * Negative = days BEFORE due (still within grace period).
 */
export function daysFromDueDate(dueDate: Date): number {
  const todayCOT = startOfDay(new TZDate(new Date(), COT_TIMEZONE));
  const dueDateCOT = startOfDay(new TZDate(dueDate, COT_TIMEZONE));
  return differenceInDays(todayCOT, dueDateCOT);
}

/**
 * Given a billing period month/year, returns the pronto pago deadline.
 * Colombian convention: pronto pago window = days 1–10 of the billing month.
 * Due date = day 10. After that, tarifa plena. After day 30/EOM, mora starts.
 */
export function getBillingDates(
  periodMonth: number, // 1–12
  periodYear: number,
): {
  billingStart: Date;   // Day 1 of month
  prontoPagoDeadline: Date; // Day 10, 23:59:59 COT
  tarifaPlenaDeadline: Date; // Last day of month, 23:59:59 COT
  moraStartDate: Date;  // Day 1 of next month
} {
  // Day 1 midnight COT
  const billingStart = new TZDate(
    new Date(periodYear, periodMonth - 1, 1, 0, 0, 0),
    COT_TIMEZONE,
  );

  // Day 10 end of day COT
  const prontoPagoDeadline = new TZDate(
    new Date(periodYear, periodMonth - 1, 10, 23, 59, 59),
    COT_TIMEZONE,
  );

  // Last day of month end of day COT
  const lastDay = new Date(periodYear, periodMonth, 0).getDate(); // 0th day of next month = last day of this month
  const tarifaPlenaDeadline = new TZDate(
    new Date(periodYear, periodMonth - 1, lastDay, 23, 59, 59),
    COT_TIMEZONE,
  );

  // Day 1 of next month midnight COT
  const moraStartDate = new TZDate(
    new Date(periodYear, periodMonth, 1, 0, 0, 0),
    COT_TIMEZONE,
  );

  return { billingStart, prontoPagoDeadline, tarifaPlenaDeadline, moraStartDate };
}

/**
 * UTC instants bounding a single COT calendar day, for `where` filters like
 * `{ gte, lt }`. COT is UTC-5 with no DST, so a COT day [00:00, next 00:00)
 * maps to [Y-M-D 05:00Z, Y-M-(D+1) 05:00Z). `Date.UTC` handles month/year
 * rollover. Throws on a malformed date so callers can 400.
 */
export function dayRangeCOT(dateStr: string): { gte: Date; lt: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error('date must be YYYY-MM-DD');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return {
    gte: new Date(Date.UTC(y, mo - 1, d, 5, 0, 0)),
    lt: new Date(Date.UTC(y, mo - 1, d + 1, 5, 0, 0)),
  };
}
