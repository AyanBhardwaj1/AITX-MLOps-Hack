import { monthKey, openMonth, shiftMonth } from "../dates";
import type { Category, Cents, EnrichedTxn, IsoDate } from "../types";
import { countsTowardBurn } from "./runway";

/**
 * "Why did burn move?": last complete month against the one before, vendor by vendor. It adds up
 * exactly, in cents: the vendor changes plus everything else, minus the change in money coming
 * in, equals the change in net burn. Same rule as burn (no transfers, posted only). Pure.
 */

export interface BurnDriver {
  key: string;
  name: string;
  category: Category;
  /** More spent (positive) or less (negative) than the month before. */
  changeCents: Cents;
  /** "new": nothing the month before; "stopped": nothing this month. */
  kind: "new" | "stopped" | "up" | "down";
}

export interface BurnBridge {
  /** YYYY-MM compared, and the month before it. */
  month: string;
  previous: string;
  netBurnCents: Cents;
  previousNetBurnCents: Cents;
  changeCents: Cents;
  /** The vendors that moved spending most, biggest change first. */
  drivers: BurnDriver[];
  /** Every other vendor's change, together. */
  otherCents: Cents;
  /** More money coming in (positive) lowers burn by as much; a refund from a vendor paid counts against that vendor. */
  revenueChangeCents: Cents;
}

const DEFAULT_TOP = 5;

export function burnBridge(txns: readonly EnrichedTxn[], asOf: IsoDate, { top = DEFAULT_TOP }: { top?: number } = {}): BurnBridge | null {
  const month = shiftMonth(openMonth(asOf), -1);
  const previous = shiftMonth(month, -1);
  // Both months must be whole: the data has to start on or before the 1st of the earlier one.
  const first = txns.reduce<IsoDate | null>((min, t) => (min === null || t.postedAt < min ? t.postedAt : min), null);
  if (first === null || first > `${previous}-01`) return null;

  const spend = new Map<string, { name: string; category: Category; now: number; before: number }>();
  let inNow = 0;
  let inBefore = 0;
  const inMonths = (t: EnrichedTxn) => {
    const m = monthKey(t.postedAt);
    return (m === month || m === previous) && countsTowardBurn(t);
  };
  // Vendors paid in either month: money back from one of them is a refund against its spend.
  const paid = new Set(txns.filter((t) => t.amountCents < 0 && inMonths(t)).map((t) => t.vendor.key));
  for (const t of txns) {
    if (!inMonths(t)) continue;
    const m = monthKey(t.postedAt);
    // Money in (revenue, customer payments, interest) unless it's a refund from a vendor paid.
    if (t.amountCents >= 0 && (t.vendor.category === "revenue" || !paid.has(t.vendor.key))) {
      if (m === month) inNow += t.amountCents;
      else inBefore += t.amountCents;
      continue;
    }
    const v = spend.get(t.vendor.key) ?? { name: t.vendor.name, category: t.vendor.category, now: 0, before: 0 };
    if (m === month) v.now -= t.amountCents;
    else v.before -= t.amountCents;
    spend.set(t.vendor.key, v);
  }

  // Two empty months say nothing, rather than "unchanged at $0".
  if (spend.size === 0 && inNow === 0 && inBefore === 0) return null;
  const outNow = [...spend.values()].reduce((s, v) => s + v.now, 0);
  const outBefore = [...spend.values()].reduce((s, v) => s + v.before, 0);
  const changes: BurnDriver[] = [...spend]
    .map(([key, v]) => ({
      key,
      name: v.name,
      category: v.category,
      changeCents: v.now - v.before,
      kind: v.before <= 0 && v.now > 0 ? ("new" as const) : v.now <= 0 && v.before > 0 ? ("stopped" as const) : v.now > v.before ? ("up" as const) : ("down" as const),
    }))
    .filter((d) => d.changeCents !== 0)
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents) || a.name.localeCompare(b.name));
  const drivers = changes.slice(0, top);
  const netBurnCents = outNow - inNow;
  const previousNetBurnCents = outBefore - inBefore;
  return {
    month,
    previous,
    netBurnCents,
    previousNetBurnCents,
    changeCents: netBurnCents - previousNetBurnCents,
    drivers,
    otherCents: changes.slice(top).reduce((s, d) => s + d.changeCents, 0),
    revenueChangeCents: inNow - inBefore,
  };
}
