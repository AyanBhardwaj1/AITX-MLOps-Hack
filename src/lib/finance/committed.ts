import { addDays } from "../dates";
import type { Category, Cents, IsoDate, RecurringStream } from "../types";
import { chargeDates } from "./schedule";

/**
 * What's already scheduled to go out: every recurring charge (payroll, rent, subscriptions …)
 * expected over the next few weeks, from the billing rhythm of active streams, at its typical
 * amount. Deterministic; one-off and usage spend aren't included, so it's a floor, not a forecast.
 */

export interface CommittedItem {
  date: IsoDate;
  vendorKey: string;
  vendorName: string;
  category: Category;
  amountCents: Cents;
}

export interface CommittedSpend {
  from: IsoDate;
  until: IsoDate;
  items: CommittedItem[];
  totalCents: Cents;
  /** Cash once these have gone out (before any money comes in). */
  cashAfterCents: Cents;
}

/** Money in and moves between your own accounts are never "spend". */
const NOT_SPEND: ReadonlySet<Category> = new Set(["revenue", "transfer"]);

export function committedSpend(streams: readonly RecurringStream[], { from, days, cashCents }: { from: IsoDate; days: number; cashCents: Cents }): CommittedSpend {
  const until = addDays(from, days - 1);
  const items = streams
    .filter((s) => s.active && !NOT_SPEND.has(s.category))
    .flatMap((s) =>
      chargeDates({ cadence: s.cadence, dueDate: s.nextExpected }, from, until).map((date) => ({
        date,
        vendorKey: s.vendorKey,
        vendorName: s.vendorName,
        category: s.category,
        amountCents: s.typicalAmountCents,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents || a.vendorName.localeCompare(b.vendorName));
  const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
  return { from, until, items, totalCents, cashAfterCents: cashCents - totalCents };
}
