import { monthKey, shiftMonth } from "../dates";
import type { Cents, EnrichedTxn, IsoDate } from "../types";

export interface MonthHistory {
  month: string;
  inflowCents: Cents;
  outflowCents: Cents;
  softwareCents: Cents;
}

const SOFTWARE_LIKE = new Set(["software", "cloud", "ai_api"]);

/** Cash in/out for the last `months` complete months before asOf, oldest first. Same rules as burn. */
export function monthlyHistory(txns: readonly EnrichedTxn[], asOf: IsoDate, months: number): MonthHistory[] {
  const current = monthKey(asOf);
  const rows = Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(current, i - months),
    inflowCents: 0,
    outflowCents: 0,
    softwareCents: 0,
  }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  for (const t of txns) {
    const row = byMonth.get(monthKey(t.postedAt));
    if (!row || t.status !== "posted" || t.type === "transfer" || t.vendor.category === "transfer") continue;
    if (t.amountCents >= 0) {
      row.inflowCents += t.amountCents;
    } else {
      row.outflowCents -= t.amountCents;
      if (SOFTWARE_LIKE.has(t.vendor.category)) row.softwareCents -= t.amountCents;
    }
  }
  return rows;
}
