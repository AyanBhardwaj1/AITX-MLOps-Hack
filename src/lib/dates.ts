import type { IsoDate } from "./types";

const MS_PER_DAY = 86_400_000;
export const AVG_DAYS_PER_MONTH = 30.4375;

function toUtc(d: IsoDate): number {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Invalid ISO date: ${d}`);
  return t;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return new Date(toUtc(d) + Math.round(days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Today's date where this code runs (the visitor's own, in the browser). */
export function localIsoDate(now: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthKey(d: IsoDate): string {
  return d.slice(0, 7);
}

/** The first month not yet complete on `asOf`: its own month, or the next one when asOf is its last day. */
export function openMonth(asOf: IsoDate): string {
  return addDays(asOf, 1).slice(8, 10) === "01" ? shiftMonth(monthKey(asOf), 1) : monthKey(asOf);
}

/** "2026-10" shifted by n months, e.g. ("2026-01", -1) → "2025-12". */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Calendar-month addition that clamps to the end of shorter months. */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const target = shiftMonth(monthKey(d), n);
  const day = Number(d.slice(8, 10));
  const [y, m] = target.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${target}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/**
 * Orders ISO dates (YYYY-MM-DD). Plain comparison gives the same order as localeCompare for these
 * strings at a fraction of the cost, which matters when sorting tens of thousands of transactions.
 */
export const compareIsoDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Today's date in an IANA time zone (the founder's, from their browser), so a row dated their today
 * counts as happened. A missing, unknown or oversized zone name falls back to UTC.
 */
export function isoDateInZone(timeZone: string | undefined, now: Date = new Date()): IsoDate {
  if (timeZone && timeZone.length <= 64) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    } catch {
      // Not a zone this runtime knows.
    }
  }
  return now.toISOString().slice(0, 10);
}
