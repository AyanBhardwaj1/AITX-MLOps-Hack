import type { Category, Cents, EnrichedTxn, IsoDate } from "../types";

/**
 * 1099 prep: who the company paid by bank (ACH, wire, check) in a calendar year that may need a
 * Form 1099 from it: contractors, lawyers and landlords. It's a list to check, not tax advice:
 * corporations usually don't need one (law firms do), and a W-9 from each payee settles it.
 * Card payments are left out because the card network reports them (Form 1099-K). Pure.
 */

export type Form1099 = "1099-NEC" | "1099-MISC";

export interface Payee1099 {
  key: string;
  name: string;
  form: Form1099;
  /** Paid in the year, after refunds from them. */
  paidCents: Cents;
  /** Payments out (refunds aren't counted as payments). */
  payments: number;
  firstPaid: IsoDate | null;
  lastPaid: IsoDate | null;
  overThreshold: boolean;
}

export interface Prep1099 {
  year: number;
  thresholdCents: Cents;
  /** Over the threshold first, biggest first; then those within half of it. */
  rows: Payee1099[];
  toFile: number;
  /**
   * Payees paid by bank over the line that Runway couldn't categorise ("other": payroll services,
   * taxes, loans, shops, and freelancers it doesn't know), biggest first: any contractor among them
   * joins the list once marked as one.
   */
  unplaced: { key: string; name: string; paidCents: Cents }[];
  /** The first date the data covers when that's after Jan 1: payments before it aren't counted. */
  partialFrom: IsoDate | null;
}

/**
 * Nonemployee pay goes on 1099-NEC, rent on 1099-MISC. "other" isn't listed: it's where every
 * payee Runway can't place lands (payroll services, tax payments, loans, shops), so a freelancer
 * there joins the list once someone sets their category to Contractors.
 */
const FORMS: Partial<Record<Category, Form1099>> = {
  contractors: "1099-NEC",
  legal_accounting: "1099-NEC",
  marketing: "1099-NEC",
  rent: "1099-MISC",
};

/**
 * Known companies (the vendor catalog) are corporations or platforms that report for you (Deel,
 * ad networks, Pilot, Carta), so they're left out, except law firms, which get one even when
 * incorporated, and landlords.
 */
const CATALOG_REPORTABLE = new Set(["wilson_sonsini"]);

const MAX_UNPLACED = 5;
const BANK_PAID = new Set<EnrichedTxn["type"]>(["ach", "wire", "other"]);

/** $600 for payments through 2025; $2,000 from 2026 (One Big Beautiful Bill Act §70433), indexed for inflation after 2026. */
export function form1099Threshold(year: number): Cents {
  return year <= 2025 ? 600_00 : 2_000_00;
}

/** Last year through filing season (1099s are due Jan 31, e-filed rent forms by Mar 31); otherwise this year so far. */
export function form1099Year(asOf: IsoDate): number {
  const year = Number(asOf.slice(0, 4));
  return Number(asOf.slice(5, 7)) <= 3 ? year - 1 : year;
}

function formFor(t: EnrichedTxn): Form1099 | null {
  const form = FORMS[t.vendor.category];
  if (!form) return null;
  if (t.vendor.source === "catalog" && t.vendor.category !== "rent" && !CATALOG_REPORTABLE.has(t.vendor.key)) return null;
  return form;
}

export function prep1099(txns: readonly EnrichedTxn[], year: number): Prep1099 | null {
  const prefix = `${year}-`;
  const threshold = form1099Threshold(year);
  const payees = new Map<string, Omit<Payee1099, "overThreshold">>();
  const unplaced = new Map<string, { key: string; name: string; paidCents: Cents }>();
  let first: IsoDate | null = null;
  for (const t of txns) {
    if (first === null || t.postedAt < first) first = t.postedAt;
    if (t.status !== "posted" || !t.postedAt.startsWith(prefix)) continue;
    if (!BANK_PAID.has(t.type)) continue;
    if (t.vendor.category === "other") {
      const u = unplaced.get(t.vendor.key) ?? { key: t.vendor.key, name: t.vendor.name, paidCents: 0 };
      u.paidCents -= t.amountCents;
      unplaced.set(t.vendor.key, u);
      continue;
    }
    const form = formFor(t);
    if (!form) continue;
    const p = payees.get(t.vendor.key) ?? { key: t.vendor.key, name: t.vendor.name, form, paidCents: 0, payments: 0, firstPaid: null, lastPaid: null };
    p.paidCents -= t.amountCents;
    if (t.amountCents < 0) {
      p.payments += 1;
      if (p.firstPaid === null || t.postedAt < p.firstPaid) p.firstPaid = t.postedAt;
      if (p.lastPaid === null || t.postedAt > p.lastPaid) p.lastPaid = t.postedAt;
    }
    payees.set(t.vendor.key, p);
  }
  const rows = [...payees.values()]
    .filter((p) => p.paidCents * 2 >= threshold)
    .map((p) => ({ ...p, overThreshold: p.paidCents >= threshold }))
    .sort((a, b) => b.paidCents - a.paidCents || a.name.localeCompare(b.name));
  const unplacedOver = [...unplaced.values()]
    .filter((u) => u.paidCents >= threshold)
    .sort((a, b) => b.paidCents - a.paidCents || a.name.localeCompare(b.name))
    .slice(0, MAX_UNPLACED);
  if (rows.length === 0 && unplacedOver.length === 0) return null;
  return {
    year,
    thresholdCents: threshold,
    rows,
    toFile: rows.filter((r) => r.overThreshold).length,
    unplaced: unplacedOver,
    partialFrom: first !== null && first > `${year}-01-01` ? first : null,
  };
}
