import type { Cents, EnrichedTxn } from "../types";
import { countsTowardBurn, inBurnPeriod, type Snapshot } from "./runway";

/**
 * Who pays the company: money in per payer per month over the months burn averages, and how much
 * runway hangs on the biggest customer. A refund from a vendor the company paid isn't a customer
 * (as in "why burn moved"), and a payment processor's payouts (Stripe) are many customers, so a
 * processor is never "the biggest customer". Pure.
 */

export interface Payer {
  key: string;
  name: string;
  monthlyCents: Cents;
  /** Of all money in (0-1). */
  share: number;
  /** A payment processor's payouts: many customers behind one name. */
  processor: boolean;
}

export interface MoneyIn {
  months: number;
  monthlyCents: Cents;
  payers: Payer[];
  /** The biggest payer that isn't a processor, and runway if their money stopped (spending unchanged). */
  topCustomer: { key: string; name: string; share: number; monthlyCents: Cents; runwayWithoutMonths: number } | null;
}

const MAX_PAYERS = 6;

/** The catalog's revenue entries are payment processors' payouts. */
const isProcessor = (t: EnrichedTxn) => t.vendor.category === "revenue" && t.vendor.source === "catalog";

export function moneyIn(txns: readonly EnrichedTxn[], snapshot: Snapshot): MoneyIn | null {
  const period = snapshot.burnPeriod;
  if (!period) return null;
  const inPeriod = txns.filter((t) => countsTowardBurn(t) && inBurnPeriod(snapshot, t));
  const paid = new Set(inPeriod.filter((t) => t.amountCents < 0).map((t) => t.vendor.key));
  const byPayer = new Map<string, { name: string; cents: number; processor: boolean }>();
  for (const t of inPeriod) {
    if (t.amountCents <= 0 || (t.vendor.category !== "revenue" && paid.has(t.vendor.key))) continue;
    const p = byPayer.get(t.vendor.key) ?? { name: t.vendor.name, cents: 0, processor: isProcessor(t) };
    p.cents += t.amountCents;
    byPayer.set(t.vendor.key, p);
  }
  const total = [...byPayer.values()].reduce((s, p) => s + p.cents, 0);
  if (total <= 0) return null;
  const perMonth = (cents: number) => Math.round(cents / period.months);
  const ranked = [...byPayer]
    .map(([key, p]) => ({ key, name: p.name, monthlyCents: perMonth(p.cents), share: p.cents / total, processor: p.processor }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.name.localeCompare(b.name));
  const top = ranked.find((p) => !p.processor) ?? null;
  const burnWithout = top ? snapshot.netBurnCents + top.monthlyCents : 0;
  return {
    months: period.months,
    monthlyCents: perMonth(total),
    payers: ranked.slice(0, MAX_PAYERS),
    topCustomer: top && {
      key: top.key,
      name: top.name,
      share: top.share,
      monthlyCents: top.monthlyCents,
      runwayWithoutMonths: burnWithout > 0 ? snapshot.cashCents / burnWithout : Number.POSITIVE_INFINITY,
    },
  };
}
