import type { Cents, EnrichedTxn } from "../types";
import { countsTowardBurn, inBurnPeriod, type Snapshot } from "./runway";

/**
 * Card spend by person: each cardholder's spending per month over exactly the months burn
 * averages (refunds lower it, as they lower burn), their biggest vendors, and their share of gross
 * burn. Spending no card names (payroll, rent, bank transfers) is shown as unassigned. Pure.
 */

export interface PersonSpend {
  cardholder: string;
  monthlyCents: Cents;
  /** Of gross burn per month (0-1). */
  shareOfGross: number;
  /** Distinct vendors they paid. */
  vendors: number;
  top: { key: string; name: string; monthlyCents: Cents }[];
}

export interface PeopleSpend {
  /** Months the averages cover (as burn's). */
  months: number;
  rows: PersonSpend[];
  /** Spending no cardholder is named on, per month. */
  unassignedMonthlyCents: Cents;
}

const TOP_VENDORS = 3;

export function peopleSpend(txns: readonly EnrichedTxn[], snapshot: Snapshot): PeopleSpend | null {
  const period = snapshot.burnPeriod;
  if (!period) return null;
  const people = new Map<string, Map<string, { name: string; cents: number }>>();
  // One person however their name is typed: the most common spelling is shown.
  const spellings = new Map<string, Map<string, number>>();
  let unassigned = 0;
  for (const t of txns) {
    if (!countsTowardBurn(t) || !inBurnPeriod(snapshot, t)) continue;
    const shown = (t.cardholder ?? "").normalize("NFKC").replace(/[\p{Cf}\p{Cc}]/gu, "").replace(/\s+/g, " ").trim();
    const who = shown.toLowerCase();
    if (!who) {
      if (t.amountCents < 0) unassigned -= t.amountCents;
      continue;
    }
    const vendors = people.get(who) ?? new Map<string, { name: string; cents: number }>();
    const v = vendors.get(t.vendor.key) ?? { name: t.vendor.name, cents: 0 };
    v.cents -= t.amountCents;
    vendors.set(t.vendor.key, v);
    people.set(who, vendors);
    const s = spellings.get(who) ?? new Map<string, number>();
    s.set(shown, (s.get(shown) ?? 0) + 1);
    spellings.set(who, s);
  }
  if (people.size === 0) return null;
  const perMonth = (cents: number) => Math.round(cents / period.months) || 0;
  const rows = [...people]
    .map(([who, vendors]) => {
      const cardholder = [...spellings.get(who)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
      const total = [...vendors.values()].reduce((s, v) => s + v.cents, 0);
      const monthlyCents = perMonth(total);
      return {
        cardholder,
        monthlyCents,
        shareOfGross: snapshot.grossBurnCents > 0 ? monthlyCents / snapshot.grossBurnCents : 0,
        vendors: [...vendors.values()].filter((v) => v.cents > 0).length,
        top: [...vendors]
          .filter(([, v]) => v.cents > 0)
          .sort((a, b) => b[1].cents - a[1].cents || a[1].name.localeCompare(b[1].name))
          .slice(0, TOP_VENDORS)
          .map(([key, v]) => ({ key, name: v.name, monthlyCents: perMonth(v.cents) })),
      };
    })
    // Refunds only (nothing spent on net): not "spend".
    .filter((p) => p.monthlyCents > 0)
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.cardholder.localeCompare(b.cardholder));
  if (rows.length === 0) return null;
  return { months: period.months, rows, unassignedMonthlyCents: perMonth(unassigned) };
}
