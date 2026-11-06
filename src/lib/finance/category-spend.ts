import { monthKey, openMonth, shiftMonth } from "../dates";
import type { Category, Cents, EnrichedTxn, IsoDate } from "../types";
import { countsTowardBurn } from "./runway";

/** Average monthly spend per category: the last few complete months against the same span before. */
export interface CategorySpendRow {
  /** "rest" folds the smallest categories into one row. */
  category: Category | "rest";
  recentCents: Cents;
  priorCents: Cents;
}

const WINDOW_MONTHS = 3;
const DEFAULT_MAX_ROWS = 8;

export function categorySpend(txns: readonly EnrichedTxn[], asOf: IsoDate, { months = WINDOW_MONTHS, maxRows = DEFAULT_MAX_ROWS } = {}): CategorySpendRow[] {
  // An export ending on a month's last day has that month complete (as burn counts it).
  const current = openMonth(asOf);
  const recent = new Set(Array.from({ length: months }, (_, i) => shiftMonth(current, -1 - i)));
  const prior = new Set(Array.from({ length: months }, (_, i) => shiftMonth(current, -1 - months - i)));
  const totals = new Map<Category, { recent: number; prior: number }>();
  for (const t of txns) {
    if (t.amountCents >= 0 || !countsTowardBurn(t)) continue;
    const m = monthKey(t.postedAt);
    const window = recent.has(m) ? "recent" : prior.has(m) ? "prior" : null;
    if (!window) continue;
    const row = totals.get(t.vendor.category) ?? { recent: 0, prior: 0 };
    row[window] -= t.amountCents;
    totals.set(t.vendor.category, row);
  }
  const rows: CategorySpendRow[] = [...totals]
    .map(([category, v]) => ({ category, recentCents: Math.round(v.recent / months), priorCents: Math.round(v.prior / months) }))
    .sort((a, b) => b.recentCents - a.recentCents || b.priorCents - a.priorCents || a.category.localeCompare(b.category));
  if (rows.length <= maxRows) return rows;
  const kept = rows.slice(0, maxRows - 1);
  const rest = rows.slice(maxRows - 1);
  return [...kept, { category: "rest", recentCents: rest.reduce((s, r) => s + r.recentCents, 0), priorCents: rest.reduce((s, r) => s + r.priorCents, 0) }];
}
