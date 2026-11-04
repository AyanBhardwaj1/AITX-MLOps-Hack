import { monthKey, shiftMonth } from "../dates";
import type { Cents, EnrichedTxn, IsoDate, RecurringStream } from "../types";

/** One recurring charge's story: what it cost each month, its latest bills and when the price moved. */
export interface VendorHistory {
  monthly: { month: string; cents: Cents }[];
  last12MonthsCents: Cents;
  recent: { date: IsoDate; amountCents: Cents; cardholder: string | null }[];
  priceChanges: { date: IsoDate; fromCents: Cents; toCents: Cents }[];
  /** The bill follows usage, so month-to-month moves aren't price changes. */
  usageBased: boolean;
}

const MONTHS = 12;
const RECENT = 6;
const MAX_CHANGES = 5;
/** Smaller moves are tax, FX or proration, not a new price. */
const PRICE_CHANGE_SHARE = 0.05;
/**
 * A bill that moves on more than a third of its charges follows usage; one or two steps (a plan
 * change, a price rise) are price changes. Variance alone can't tell them apart: a single 50%
 * step looks as spread out as usage.
 */
const USAGE_SHARE_OF_CHANGES = 1 / 3;
const MIN_CHANGES_FOR_USAGE = 3;

export function vendorHistory(stream: RecurringStream, txnsById: ReadonlyMap<string, EnrichedTxn>, asOf: IsoDate): VendorHistory {
  const charges = stream.txnIds
    .map((id) => txnsById.get(id))
    .filter((t) => t !== undefined)
    .toSorted((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  const current = monthKey(asOf);
  const monthly = Array.from({ length: MONTHS }, (_, i) => ({ month: shiftMonth(current, i - MONTHS + 1), cents: 0 }));
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  for (const t of charges) {
    const bucket = byMonth.get(monthKey(t.postedAt));
    if (bucket) bucket.cents += -t.amountCents;
  }
  const priceChanges: VendorHistory["priceChanges"] = [];
  for (let i = 1; i < charges.length; i++) {
    const from = -charges[i - 1]!.amountCents;
    const to = -charges[i]!.amountCents;
    if (from > 0 && Math.abs(to - from) / from >= PRICE_CHANGE_SHARE) priceChanges.push({ date: charges[i]!.postedAt, fromCents: from, toCents: to });
  }
  const usageBased = priceChanges.length >= MIN_CHANGES_FOR_USAGE && priceChanges.length > (charges.length - 1) * USAGE_SHARE_OF_CHANGES;
  return {
    monthly,
    last12MonthsCents: monthly.reduce((s, m) => s + m.cents, 0),
    recent: charges
      .slice(-RECENT)
      .reverse()
      .map((t) => ({ date: t.postedAt, amountCents: -t.amountCents, cardholder: t.cardholder ?? null })),
    priceChanges: usageBased ? [] : priceChanges.slice(-MAX_CHANGES),
    usageBased,
  };
}
