import { monthKey, openMonth, shiftMonth } from "../dates";
import type { Category, Cents, EnrichedTxn, IsoDate } from "../types";
import { countsTowardBurn } from "./runway";

/**
 * A cash-basis P&L for the accountant: net cash per category per whole month (money in positive,
 * refunds netted against their category), over the last `months` complete months the data fully
 * covers. Same rules as burn (posted only, transfers left out), so each month's net row is exactly
 * money in minus money out in the burn history. Pure.
 */

export interface CashPnlRow {
  category: Category;
  /** Per month, oldest first: positive is money in. */
  cents: Cents[];
  totalCents: Cents;
}

export interface CashPnl {
  /** YYYY-MM, oldest first. */
  months: string[];
  /** Money in first (biggest first), then spending (biggest first). */
  rows: CashPnlRow[];
  netCents: Cents[];
  netTotalCents: Cents;
}

const DEFAULT_MONTHS = 12;

export function cashPnl(txns: readonly EnrichedTxn[], asOf: IsoDate, { months = DEFAULT_MONTHS }: { months?: number } = {}): CashPnl | null {
  const first = txns.reduce<IsoDate | null>((min, t) => (min === null || t.postedAt < min ? t.postedAt : min), null);
  if (first === null) return null;
  const current = openMonth(asOf);
  // Whole months only: the data must start on or before the 1st of the earliest one shown.
  const all = Array.from({ length: months }, (_, i) => shiftMonth(current, i - months));
  const shown = all.filter((m) => `${m}-01` >= first);
  if (shown.length === 0) return null;
  const index = new Map(shown.map((m, i) => [m, i]));
  const byCategory = new Map<Category, Cents[]>();
  for (const t of txns) {
    const i = index.get(monthKey(t.postedAt));
    if (i === undefined || !countsTowardBurn(t)) continue;
    const row = byCategory.get(t.vendor.category) ?? shown.map(() => 0);
    row[i]! += t.amountCents;
    byCategory.set(t.vendor.category, row);
  }
  const rows = [...byCategory]
    .map(([category, cents]) => ({ category, cents, totalCents: cents.reduce((s, c) => s + c, 0) }))
    .filter((r) => r.cents.some((c) => c !== 0))
    .sort((a, b) => Number(b.totalCents > 0) - Number(a.totalCents > 0) || Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.category.localeCompare(b.category));
  const netCents = shown.map((_, i) => rows.reduce((s, r) => s + r.cents[i]!, 0));
  return { months: shown, rows, netCents, netTotalCents: netCents.reduce((s, c) => s + c, 0) };
}
