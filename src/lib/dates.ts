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

export function monthKey(d: IsoDate): string {
  return d.slice(0, 7);
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
