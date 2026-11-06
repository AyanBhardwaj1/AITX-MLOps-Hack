import type { Cents, EnrichedTxn } from "../types";
import { countsTowardBurn, inBurnPeriod, type Snapshot } from "./runway";

/**
 * Spend Runway couldn't put in a category, over the months burn averages: it still counts in
 * burn, but not in "Where the money goes", budgets or the 1099 list until someone sets a category.
 * What a person chose as "other", and Runway's own placeholders (card spend whose line items
 * weren't uploaded), aren't counted. Pure.
 */

export interface UncategorisedSpend {
  monthlyCents: Cents;
  /** Of gross burn per month (0-1). */
  shareOfGross: number;
  vendorCount: number;
  /** The biggest, to categorise first. */
  vendors: { key: string; name: string; monthlyCents: Cents }[];
}

const MAX_VENDORS = 5;

export function uncategorisedSpend(txns: readonly EnrichedTxn[], snapshot: Snapshot): UncategorisedSpend | null {
  const period = snapshot.burnPeriod;
  if (!period) return null;
  const byVendor = new Map<string, { name: string; cents: number }>();
  for (const t of txns) {
    if (t.vendor.category !== "other" || t.vendor.source === "user" || t.vendor.source === "catalog") continue;
    if (!countsTowardBurn(t) || !inBurnPeriod(snapshot, t)) continue;
    const v = byVendor.get(t.vendor.key) ?? { name: t.vendor.name, cents: 0 };
    v.cents -= t.amountCents;
    byVendor.set(t.vendor.key, v);
  }
  const perMonth = (cents: number) => Math.round(cents / period.months);
  const spent = [...byVendor].filter(([, v]) => v.cents > 0);
  if (spent.length === 0) return null;
  const monthlyCents = perMonth(spent.reduce((s, [, v]) => s + v.cents, 0));
  return {
    monthlyCents,
    shareOfGross: snapshot.grossBurnCents > 0 ? monthlyCents / snapshot.grossBurnCents : 0,
    vendorCount: spent.length,
    vendors: spent
      .map(([key, v]) => ({ key, name: v.name, monthlyCents: perMonth(v.cents) }))
      .sort((a, b) => b.monthlyCents - a.monthlyCents || a.name.localeCompare(b.name))
      .slice(0, MAX_VENDORS),
  };
}
