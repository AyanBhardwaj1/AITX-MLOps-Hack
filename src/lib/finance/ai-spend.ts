import { monthKey, shiftMonth } from "../dates";
import type { Cents, EnrichedTxn, IsoDate } from "../types";

/** Compounding a short-lived spike for a year produces silly numbers; cap the projected rate. */
const MAX_PROJECTED_MONTHLY_GROWTH = 0.3;
const PROJECTION_MONTHS = 12;

export interface AiSpendTrend {
  months: { month: string; cents: Cents }[];
  latestMonthCents: Cents;
  /** Compound average monthly growth across the window; null when the window starts at zero. */
  monthlyGrowth: number | null;
  /** Next 12 months at the (capped) current growth rate. */
  projectedNext12MonthsCents: Cents;
  vendors: { vendorKey: string; vendorName: string; cents: Cents }[];
}

/** LLM/AI API spend over the last `months` complete months. Null if the company has none. */
export function aiSpendTrend(txns: readonly EnrichedTxn[], asOf: IsoDate, months: number): AiSpendTrend | null {
  const current = monthKey(asOf);
  const window = Array.from({ length: months }, (_, i) => shiftMonth(current, i - months));
  const totals = new Map(window.map((m) => [m, 0]));
  const latest = window.at(-1)!;
  const byVendor = new Map<string, { vendorKey: string; vendorName: string; cents: number }>();

  for (const t of txns) {
    const m = monthKey(t.postedAt);
    if (t.vendor.category !== "ai_api" || t.status !== "posted" || t.amountCents >= 0 || !totals.has(m)) continue;
    totals.set(m, totals.get(m)! - t.amountCents);
    if (m === latest) {
      const v = byVendor.get(t.vendor.key) ?? { vendorKey: t.vendor.key, vendorName: t.vendor.name, cents: 0 };
      byVendor.set(t.vendor.key, { ...v, cents: v.cents - t.amountCents });
    }
  }

  const series = window.map((month) => ({ month, cents: totals.get(month)! }));
  if (series.every((m) => m.cents === 0)) return null;
  const first = series[0]!.cents;
  const last = series.at(-1)!.cents;
  const monthlyGrowth = first > 0 && last > 0 ? (last / first) ** (1 / (series.length - 1)) - 1 : null;
  const g = Math.min(monthlyGrowth ?? 0, MAX_PROJECTED_MONTHLY_GROWTH);
  const projected = Array.from({ length: PROJECTION_MONTHS }, (_, k) => last * (1 + g) ** (k + 1)).reduce((s, x) => s + x, 0);

  return {
    months: series,
    latestMonthCents: last,
    monthlyGrowth,
    projectedNext12MonthsCents: Math.round(projected),
    vendors: [...byVendor.values()].sort((a, b) => b.cents - a.cents),
  };
}
