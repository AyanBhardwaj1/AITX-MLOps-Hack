import { addDays } from "../dates";
import type { RhoTransaction } from "../rho/schema";
import { createRng } from "../seed/rng";
import type { DemoCompany } from "../seed/demo-company";
import { resolveVendor } from "../vendors/normalize";

/**
 * Real-world ledger shapes the detectors were not tuned on, applied to a generated company.
 * Each perturbation is motivated by how real card and bank feeds differ from the demo generator,
 * and states how it changes the ground truth. Used by scripts/stress-eval.ts.
 */

export type Perturbation =
  | "billing_day_drift"
  | "harsh_day_jitter"
  | "vendor_rename"
  | "refunds"
  | "shared_card"
  | "seat_cards"
  | "annual_billing"
  | "usage_priced"
  | "split_workspaces"
  | "refunded_double_charge"
  | "unaliased_rename"
  | "short_history"
  | "combined";

export const PERTURBATIONS: readonly Exclude<Perturbation, "combined">[] = [
  "billing_day_drift",
  "harsh_day_jitter",
  "vendor_rename",
  "refunds",
  "shared_card",
  "seat_cards",
  "annual_billing",
  "usage_priced",
  "split_workspaces",
  "refunded_double_charge",
  "unaliased_rename",
  "short_history",
];

const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const withDate = (t: RhoTransaction, date: string): RhoTransaction => ({
  ...t,
  initiated_at: `${date}T15:00:00Z`,
  posted_at: t.posted_at ? `${date}T18:00:00Z` : t.posted_at,
});
const isSubscriptionCharge = (t: RhoTransaction) => {
  if (t.transaction_type !== "card_debit" || t.amount.amount >= 0) return false;
  const v = resolveVendor(t.counterparty_name);
  return v.category === "software" || v.key === "vercel";
};
const vendorKey = (t: RhoTransaction) => resolveVendor(t.counterparty_name).key;

type Apply = (c: DemoCompany, seed: number) => DemoCompany;

/**
 * Card charges post on business days: a charge due on a weekend posts the next Monday, plus 0-1 day
 * of processing lag. Same offset for a vendor within a month, so a same-day double charge stays one.
 * Truth unchanged.
 */
const billingDayDrift: Apply = (c, seed) => {
  const rng = createRng(seed ^ 0x11);
  const lag = new Map<string, number>();
  return {
    ...c,
    transactions: c.transactions.map((t) => {
      if (!isSubscriptionCharge(t)) return t;
      const date = dateOf(t);
      const key = `${vendorKey(t)}|${date.slice(0, 7)}`;
      if (!lag.has(key)) lag.set(key, rng.int(0, 1));
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekend = dow === 6 ? 2 : dow === 0 ? 1 : 0;
      const d = addDays(date, weekend + lag.get(key)!);
      return withDate(t, d > c.asOf ? c.asOf : d);
    }),
  };
};

/** Billing entities change mid-history (e.g. a vendor moves to its Irish entity). Truth unchanged. */
const RENAMES: Readonly<Record<string, string>> = { datadog: "DATADOG HQ NEW YORK", hubspot: "HUBSPOT IRELAND LTD", zoom: "ZOOM VIDEO COMMUNICATIONS INC" };
const vendorRename: Apply = (c) => {
  const dates = c.transactions.map(dateOf).sort();
  const midpoint = dates[Math.floor(dates.length / 2)]!;
  return {
    ...c,
    transactions: c.transactions.map((t) => {
      const renamed = RENAMES[vendorKey(t)];
      return renamed && isSubscriptionCharge(t) && dateOf(t) >= midpoint ? { ...t, counterparty_name: renamed } : t;
    }),
  };
};

/** Partial refunds and credits on ~15% of subscription charges. Truth unchanged. */
const refunds: Apply = (c, seed) => {
  const rng = createRng(seed ^ 0x22);
  const extra: RhoTransaction[] = [];
  for (const t of c.transactions) {
    if (!isSubscriptionCharge(t) || !rng.chance(0.15)) continue;
    const d = addDays(dateOf(t), rng.int(2, 10));
    if (d > c.asOf) continue;
    extra.push(withDate({ ...t, id: `${t.id}_rf`, money_movement_id: null, transaction_type: "card_credit", amount: { ...t.amount, amount: Math.round(-t.amount.amount * (0.1 + rng.next() * 0.4)) } }, d));
  }
  return { ...c, transactions: [...c.transactions, ...extra] };
};

/** Tiny teams often put every tool on the founder's card. No card is idle, so the idle-card waste is no longer detectable from cards. */
const sharedCard: Apply = (c) => ({
  ...c,
  transactions: c.transactions.map((t) =>
    isSubscriptionCharge(t) ? { ...t, user_full_name: "Maya Thompson", card_id: "card_maya", card_name: "Maya's card" } : t,
  ),
  truth: c.truth.filter((w) => w.kind !== "zombie"),
});

/**
 * Per-employee cards that only pay that person's own seat (common with GitHub/Figma/1Password
 * seats). These people are active employees; bank data can't see usage. Not waste.
 */
const SEAT_VENDORS = ["GITHUB.COM", "FIGMA", "1PASSWORD", "NOTION LABS"] as const;
const SEAT_HOLDERS = ["Ava Chen", "Leo Park", "Nia Brooks", "Omar Haddad", "Ruth Silva", "Kai Moreno", "Ines Duarte", "Theo Grant"] as const;
const seatCards: Apply = (c, seed) => {
  const rng = createRng(seed ^ 0x33);
  const extra: RhoTransaction[] = [];
  const end = c.asOf;
  SEAT_HOLDERS.forEach((holder, h) => {
    const vendor = SEAT_VENDORS[h % SEAT_VENDORS.length]!;
    const first = holder.split(" ")[0]!;
    for (let m = 0; m < 12; m++) {
      const d = addDays(end, -30 * m - rng.int(0, 2) - 5);
      extra.push({
        id: `seat_${h}_${m}`,
        money_movement_id: null,
        account_id: "acc_taco_card",
        account_name: "Rho Card",
        account_type: "credit",
        amount: { amount: -1_500 - h * 100, currency: "USD" },
        status: "settled",
        transaction_type: "card_debit",
        counterparty_name: vendor,
        initiated_at: `${d}T15:00:00Z`,
        posted_at: `${d}T18:00:00Z`,
        card_id: `card_${first.toLowerCase()}`,
        card_name: `${first}'s card`,
        user_full_name: holder,
      });
    }
  });
  return { ...c, transactions: [...c.transactions, ...extra] };
};

/** Some tools billed yearly at a discount instead of monthly. Truth unchanged. */
const ANNUALIZED = new Set(["slack", "github", "linear"]);
const annualBilling: Apply = (c) => {
  const keep = new Map<string, string>();
  return {
    ...c,
    transactions: c.transactions.flatMap((t) => {
      const key = vendorKey(t);
      if (!ANNUALIZED.has(key) || !isSubscriptionCharge(t)) return [t];
      const month = dateOf(t).slice(5, 7);
      const anchor = keep.get(key) ?? month;
      keep.set(key, anchor);
      return month === anchor ? [{ ...t, amount: { ...t.amount, amount: t.amount.amount * 10 } }] : [];
    }),
  };
};

/** Seat- and usage-priced SaaS: bills drift up and jitter month to month. Not price creep. Truth unchanged. */
const USAGE_PRICED = new Set(["intercom", "sentry", "vercel"]);
const usagePriced: Apply = (c, seed) => {
  const rng = createRng(seed ^ 0x44);
  const months = [...new Set(c.transactions.map((t) => dateOf(t).slice(0, 7)))].sort();
  return {
    ...c,
    transactions: c.transactions.map((t) => {
      if (!USAGE_PRICED.has(vendorKey(t)) || !isSubscriptionCharge(t)) return t;
      const i = months.indexOf(dateOf(t).slice(0, 7));
      const factor = (1 + 0.03 * i) * (0.85 + rng.next() * 0.3);
      return { ...t, amount: { ...t.amount, amount: Math.round(t.amount.amount * factor) } };
    }),
  };
};

/** Sensitivity only (beyond typical posting): ±4 days, same offset per vendor and month. Truth unchanged. */
const harshDayJitter: Apply = (c, seed) => {
  const rng = createRng(seed ^ 0x55);
  const offset = new Map<string, number>();
  return {
    ...c,
    transactions: c.transactions.map((t) => {
      if (!isSubscriptionCharge(t)) return t;
      const key = `${vendorKey(t)}|${dateOf(t).slice(0, 7)}`;
      if (!offset.has(key)) offset.set(key, rng.int(-4, 4));
      const d = addDays(dateOf(t), offset.get(key)!);
      return withDate(t, d > c.asOf ? c.asOf : d);
    }),
  };
};

/** Two workspaces of one tool billed on the same card the same day, every month (intentional, not a billing error). Truth unchanged. */
const splitWorkspaces: Apply = (c) => ({
  ...c,
  transactions: [
    ...c.transactions,
    ...c.transactions
      .filter((t) => isSubscriptionCharge(t) && vendorKey(t) === "miro")
      .map((t) => ({ ...t, id: `${t.id}_ws2`, money_movement_id: null })),
  ],
});

/** The vendor already refunded the double charge: nothing left to recover. Truth drops the double charge. */
const refundedDoubleCharge: Apply = (c) => {
  const dup = c.transactions.filter((t) => vendorKey(t) === "canva" && t.amount.amount < 0).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const second = dup[1];
  if (!second) return c;
  const refund = withDate({ ...second, id: `${second.id}_refund`, money_movement_id: null, transaction_type: "card_credit", amount: { ...second.amount, amount: -second.amount.amount } }, addDays(dateOf(second), 6));
  return { ...c, transactions: [...c.transactions, refund], truth: c.truth.filter((w) => w.kind !== "duplicate_charge") };
};

/** A billing name the alias table doesn't know, from mid-history on (e.g. a new payment processor). Truth unchanged. */
const unaliasedRename: Apply = (c) => {
  const dates = c.transactions.map(dateOf).sort();
  const midpoint = dates[Math.floor(dates.length / 2)]!;
  return {
    ...c,
    transactions: c.transactions.map((t) => (vendorKey(t) === "datadog" && isSubscriptionCharge(t) && dateOf(t) >= midpoint ? { ...t, counterparty_name: "DDOG BILLING 8443" } : t)),
  };
};

/** Only the last 12 months of history (a newer company, or a newly connected account). Truth unchanged. */
const shortHistory: Apply = (c) => {
  const cutoff = addDays(c.asOf, -365);
  return { ...c, transactions: c.transactions.filter((t) => dateOf(t) > cutoff) };
};

const APPLY: Record<Exclude<Perturbation, "combined">, Apply> = {
  billing_day_drift: billingDayDrift,
  harsh_day_jitter: harshDayJitter,
  vendor_rename: vendorRename,
  refunds,
  shared_card: sharedCard,
  seat_cards: seatCards,
  annual_billing: annualBilling,
  usage_priced: usagePriced,
  split_workspaces: splitWorkspaces,
  refunded_double_charge: refundedDoubleCharge,
  unaliased_rename: unaliasedRename,
  short_history: shortHistory,
};

export function perturb(company: DemoCompany, p: Perturbation, seed: number): DemoCompany {
  if (p !== "combined") return APPLY[p](company, seed);
  // Realistic shapes together: not shared_card (erases the idle-card cases seat_cards tests) or the harsh jitter.
  return PERTURBATIONS.filter((x) => x !== "shared_card" && x !== "harsh_day_jitter").reduce((c, x) => APPLY[x](c, seed), company);
}
