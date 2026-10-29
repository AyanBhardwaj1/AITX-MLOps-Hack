import { daysBetween } from "../dates";
import type { Cadence, Category, Cents, IsoDate, RecurringStream } from "../types";

/** Subscription-style spend. Payroll, rent and usage-based bills aren't "renewals" to decide on. */
const RENEWAL_CATEGORIES: ReadonlySet<Category> = new Set(["software", "insurance", "legal_accounting", "other"]);
const LUMPY_CADENCES: ReadonlySet<Cadence> = new Set(["quarterly", "annual"]);
/** A single charge this big ($5k+) deserves a decision before it lands, whatever its cadence. */
const DECIDE_MIN_CENTS = 500_000;
export const DEFAULT_RENEWAL_WINDOW_DAYS = 60;

export interface Renewal {
  vendorKey: string;
  vendorName: string;
  cardholder: string | null;
  cadence: Cadence;
  dueDate: IsoDate;
  daysAway: number;
  amountCents: Cents;
  /** Annual/quarterly or large: cancel, downgrade or renegotiate before it renews. */
  decide: boolean;
}

/** Charges expected within `windowDays` of asOf, soonest first. Based on detected billing cadence. */
export function upcomingRenewals(streams: readonly RecurringStream[], asOf: IsoDate, windowDays = DEFAULT_RENEWAL_WINDOW_DAYS): Renewal[] {
  return streams
    .filter((s) => s.active && RENEWAL_CATEGORIES.has(s.category))
    .map((s) => ({ s, daysAway: daysBetween(asOf, s.nextExpected) }))
    .filter(({ daysAway }) => daysAway >= 0 && daysAway <= windowDays)
    .sort((a, b) => a.daysAway - b.daysAway || b.s.typicalAmountCents - a.s.typicalAmountCents)
    .map(({ s, daysAway }) => ({
      vendorKey: s.vendorKey,
      vendorName: s.vendorName,
      cardholder: s.cardholder,
      cadence: s.cadence,
      dueDate: s.nextExpected,
      daysAway,
      amountCents: s.typicalAmountCents,
      decide: LUMPY_CADENCES.has(s.cadence) || s.typicalAmountCents >= DECIDE_MIN_CENTS,
    }));
}
