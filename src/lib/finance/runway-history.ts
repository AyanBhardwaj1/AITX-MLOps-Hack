import { monthKey, shiftMonth } from "../dates";
import type { Cents, EnrichedTxn, IsoDate } from "../types";
import { computeSnapshot } from "./runway";

/**
 * Runway as it stood at the start of each recent month, rebuilt from the feed: cash then is today's
 * balance minus everything that moved through cash accounts since, and burn then uses the same rule
 * (and lookback) as today's number. Card accounts hold no cash; paying them off from checking does.
 */

export interface RunwayPoint {
  date: IsoDate;
  cashCents: Cents;
  netBurnCents: Cents;
  runwayMonths: number;
}

interface Input {
  txns: readonly EnrichedTxn[];
  cashAccountIds: ReadonlySet<string>;
  cashCents: Cents;
  asOf: IsoDate;
  months?: number;
}

const DEFAULT_MONTHS = 6;

export function runwayHistory({ txns, cashAccountIds, cashCents, asOf, months = DEFAULT_MONTHS }: Input): RunwayPoint[] {
  const cashMoves = txns.filter((t) => t.status === "posted" && cashAccountIds.has(t.accountId)).toSorted((a, b) => a.postedAt.localeCompare(b.postedAt));
  const current = monthKey(asOf);
  const dates = [...Array.from({ length: months }, (_, i) => `${shiftMonth(current, i - months + 1)}-01`), asOf].filter((d, i, all) => all.indexOf(d) === i);
  return dates.map((date) => {
    // Cash at the start of `date`: undo everything that happened on or after it.
    const later = date === asOf ? 0 : cashMoves.reduce((s, t) => (t.postedAt >= date ? s + t.amountCents : s), 0);
    const snap = computeSnapshot({ cashCents: cashCents - later, txns, asOf: date });
    return { date, cashCents: snap.cashCents, netBurnCents: snap.netBurnCents, runwayMonths: snap.runwayMonths };
  });
}
