import { isPaymentProcessor, type Cents, type EnrichedTxn } from "../types";
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
  /** Whole months averaged, as burn's (0: the days so far). */
  months: number;
  monthlyCents: Cents;
  payers: Payer[];
  /** Everyone not listed, so the rows add up to monthlyCents. */
  othersMonthlyCents: Cents;
  /** The biggest payer that isn't a processor, and runway if their money stopped (spending unchanged). */
  topCustomer: { key: string; name: string; share: number; monthlyCents: Cents; runwayWithoutMonths: number } | null;
}

const MAX_PAYERS = 6;
/** Money in that isn't a customer paying: interest, transfers, deposits returned, loans. */
const NOT_A_CUSTOMER =
  /^(?:interest|dividends?)$|\b(?:interest (?:paid|payment|earned|credit|income)|dividends? (?:paid|payment|income)|transfer from|deposit (?:return|refund)|loan (?:proceeds|disbursement|advance)|irs|us treasury|treas 310|tax refund)\b/i;

/** The catalog's revenue entries are payment processors' payouts. */
const isProcessor = (t: EnrichedTxn) => isPaymentProcessor(t.vendor);

export function moneyIn(txns: readonly EnrichedTxn[], snapshot: Snapshot): MoneyIn | null {
  const period = snapshot.burnPeriod;
  if (!period) return null;
  const counted = txns.filter(countsTowardBurn);
  // Over all the data, a payer the company paid at least as much as it got back is a vendor
  // refunding (a deposit returned, a credit), not a customer. A credit sent to a customer who pays
  // far more doesn't make them a vendor.
  const net = new Map<string, number>();
  for (const t of counted) net.set(t.vendor.key, (net.get(t.vendor.key) ?? 0) + t.amountCents);
  const byPayer = new Map<string, { name: string; cents: number; processor: boolean; customer: boolean }>();
  for (const t of counted) {
    if (t.amountCents <= 0 || !inBurnPeriod(snapshot, t)) continue;
    if (t.vendor.category !== "revenue" && (net.get(t.vendor.key) ?? 0) <= 0) continue;
    const processor = isProcessor(t);
    const p = byPayer.get(t.vendor.key) ?? { name: t.vendor.name, cents: 0, processor, customer: !processor && !NOT_A_CUSTOMER.test(t.vendor.name) };
    p.cents += t.amountCents;
    byPayer.set(t.vendor.key, p);
  }
  const total = [...byPayer.values()].reduce((s, p) => s + p.cents, 0);
  if (total <= 0) return null;
  const perMonth = (cents: number) => Math.round(cents / period.months);
  const ranked = [...byPayer]
    .map(([key, p]) => ({ key, name: p.name, monthlyCents: perMonth(p.cents), share: p.cents / total, processor: p.processor, customer: p.customer }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.name.localeCompare(b.name));
  const top = ranked.find((p) => p.customer) ?? null;
  const burnWithout = top ? snapshot.netBurnCents + top.monthlyCents : 0;
  const monthlyCents = perMonth(total);
  const payers = ranked.slice(0, MAX_PAYERS).map(({ customer: _, ...p }) => p);
  return {
    months: snapshot.burnMonths,
    monthlyCents,
    payers,
    // The remainder, so the rows add up (with every payer listed, only rounding would be left).
    othersMonthlyCents: ranked.length > MAX_PAYERS ? monthlyCents - payers.reduce((s, p) => s + p.monthlyCents, 0) : 0,
    topCustomer: top && {
      key: top.key,
      name: top.name,
      share: top.share,
      monthlyCents: top.monthlyCents,
      // As runway itself: cash already below zero is no runway, not a negative one.
      runwayWithoutMonths: burnWithout > 0 ? Math.max(0, snapshot.cashCents / burnWithout) : Number.POSITIVE_INFINITY,
    },
  };
}
