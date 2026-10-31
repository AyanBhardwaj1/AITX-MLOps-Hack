import { addDays, monthKey, shiftMonth } from "../dates";
import type { RhoTransaction } from "../rho/schema";
import type { DemoCompany, PlantedWaste } from "../seed/demo-company";
import { createRng, type Rng } from "../seed/rng";
import { resolveVendor } from "../vendors/normalize";

/**
 * HELD-OUT variants for the waste detectors, written from plain-language failure descriptions
 * before any detector fix and without looking at detector internals. Not for tuning: they use
 * different vendors, parameters and shapes than the dev perturbations in ./perturb.ts.
 *
 * Spec the expectations follow (not any implementation):
 * - price_creep: a fixed-price subscription whose charge steps up to a new level (>= 20% AND >= $25/month)
 *   and stays there. Smooth usage/seat growth and noisy usage bills are not price creep.
 * - duplicate_charge: same vendor, same card, same amount, twice within ~3 days, a one-off error that has
 *   NOT been refunded. Two charges every month (two workspaces) is not a duplicate charge. A refund of the
 *   duplicated amount 1-20 days later (any descriptor, possibly across a month end) means no waste.
 *   A partial refund leaves the unrecovered remainder as waste (still flagged).
 * - zombie: cardholder with no non-subscription spend for 60+ days whose card still pays subscriptions;
 *   recurring second-workspace charges are subscriptions, not "other spend".
 *
 * Each `apply` is pure: it returns a new DemoCompany, keeps every date <= asOf, uses `createRng`
 * for randomness and only adds transactions with fresh ids.
 */

export type HeldOut = {
  name: string;
  failureMode: "usage_priced" | "split_workspaces" | "refunded_double_charge";
  expectation: string;
  apply: (c: DemoCompany, seed: number) => DemoCompany;
};

type Apply = HeldOut["apply"];

const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const withDate = (t: RhoTransaction, date: string): RhoTransaction => ({
  ...t,
  initiated_at: `${date}${t.initiated_at.slice(10)}`,
  posted_at: t.posted_at ? `${date}${t.posted_at.slice(10)}` : t.posted_at,
});
const keyOf = (t: RhoTransaction) => resolveVendor(t.counterparty_name).key;
const isCharge = (t: RhoTransaction) => t.transaction_type === "card_debit" && t.amount.amount < 0;
const withCents = (t: RhoTransaction, cents: number): RhoTransaction => ({ ...t, amount: { ...t.amount, amount: cents } });
/** Scales a charge's magnitude, rounding half-cents up in absolute value (matches Math.round on positive cents). */
const scaleCharge = (t: RhoTransaction, factor: number) => withCents(t, -Math.round(-t.amount.amount * factor));
const monthIndex = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
};
/** Whole calendar months from `date` to `asOf` (0 for the asOf month). */
const monthsBefore = (date: string, asOf: string) => monthIndex(monthKey(asOf)) - monthIndex(monthKey(date));
/** Uniform multiplicative noise in [1 - pct, 1 + pct]. */
const jitter = (rng: Rng, pct: number) => 1 + pct * (2 * rng.next() - 1);

/** Settled card charges of one vendor, oldest first. */
const chargesOf = (c: DemoCompany, key: string) =>
  c.transactions.filter((t) => isCharge(t) && t.status === "settled" && keyOf(t) === key).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

const copyTruth = (truth: readonly PlantedWaste[]) => truth.map((w) => ({ ...w, vendorKeys: [...w.vendorKeys] }));

// ---------------------------------------------------------------------------------------------
// usage_priced
// ---------------------------------------------------------------------------------------------

/**
 * Compounding monthly growth with per-charge noise, anchored so the asOf month is at the nominal
 * price (earlier months were cheaper). Applies to every card charge of the listed vendors.
 */
function usageGrowth(vendors: readonly string[], monthlyGrowth: number, noisePct: number, salt: number): Apply {
  const set = new Set(vendors);
  return (c, seed) => {
    const rng = createRng(seed ^ salt);
    return {
      ...c,
      transactions: c.transactions.map((t) => {
        if (!isCharge(t) || !set.has(keyOf(t))) return t;
        const factor = Math.pow(1 + monthlyGrowth, -monthsBefore(dateOf(t), c.asOf)) * jitter(rng, noisePct);
        return scaleCharge(t, factor);
      }),
      truth: copyTruth(c.truth),
    };
  };
}

/** Months (from asOf's month back) at which the step variants switch to the new price, like the planted Datadog step. */
const STEP_MONTHS_AGO = 4;

/** Multiply every charge of `key` from STEP_MONTHS_AGO months before asOf onwards by `factor`. Returns old/new nominal cents. */
function priceStep(c: DemoCompany, key: string, factor: number): { company: DemoCompany; oldCents: number; newCents: number } {
  const from = shiftMonth(monthKey(c.asOf), -STEP_MONTHS_AGO);
  const before = chargesOf(c, key).filter((t) => monthKey(dateOf(t)) < from);
  const oldCents = -before[before.length - 1]!.amount.amount;
  const newCents = Math.round(oldCents * factor);
  return {
    oldCents,
    newCents,
    company: {
      ...c,
      transactions: c.transactions.map((t) =>
        isCharge(t) && keyOf(t) === key && monthKey(dateOf(t)) >= from ? scaleCharge(t, factor) : t,
      ),
      truth: copyTruth(c.truth),
    },
  };
}

/** Vendors whose +25% is >= $25/month (Slack $480, Google Workspace $864, Zoom $149.90) and that are not in a price_creep truth item. */
export const REAL_STEP_VENDORS = ["slack", "google_workspace", "zoom"] as const;
export const REAL_STEP_FACTOR = 1.25;

const realPriceStep: Apply = (c, seed) => {
  const key = createRng(seed ^ 0x7a31).pick(REAL_STEP_VENDORS);
  const { company, oldCents, newCents } = priceStep(c, key, REAL_STEP_FACTOR);
  return {
    ...company,
    truth: [
      ...company.truth,
      {
        kind: "price_creep",
        vendorKeys: [key],
        monthlyCents: newCents - oldCents,
        oneTimeCents: 0,
        note: `Held-out: ${key} list price +25% (${oldCents / 100} → ${newCents / 100}) ${STEP_MONTHS_AGO} months before asOf`,
      },
    ],
  };
};

/** Flat vendors whose +25% is below the $25/month floor (Linear $64 → +$16, 1Password $48 → +$12). */
export const SUB_FLOOR_STEP_VENDORS = ["linear", "one_password"] as const;

const subFloorPriceStep: Apply = (c, seed) => priceStep(c, createRng(seed ^ 0x7a32).pick(SUB_FLOOR_STEP_VENDORS), REAL_STEP_FACTOR).company;

/** Slack modelled as 12 seats x $40 = $480; one seat added every 3-5 months (per seed) from the first Slack bill. */
export const SLACK_SEAT_CENTS = 4_000;
const seatSteps: Apply = (c, seed) => {
  const gap = createRng(seed ^ 0x7a33).int(3, 5);
  const first = chargesOf(c, "slack")[0];
  if (!first) return { ...c, truth: copyTruth(c.truth) };
  const start = monthIndex(monthKey(dateOf(first)));
  return {
    ...c,
    transactions: c.transactions.map((t) => {
      if (!isCharge(t) || keyOf(t) !== "slack") return t;
      const added = Math.floor((monthIndex(monthKey(dateOf(t))) - start) / gap);
      return withCents(t, t.amount.amount - added * SLACK_SEAT_CENTS);
    }),
    truth: copyTruth(c.truth),
  };
};

// ---------------------------------------------------------------------------------------------
// split_workspaces
// ---------------------------------------------------------------------------------------------

interface SecondWorkspace {
  key: string;
  /** Fixed amount of the second workspace; default: same as each original charge. */
  cents?: number;
  /** Days after the original charge; default 0 (same day). */
  dayOffset?: number;
  /** Only months from this many months before asOf; default: the whole history. */
  sinceMonthsAgo?: number;
  suffix: string;
}

/** Adds a second recurring workspace of `key` on the same card as each original monthly charge. */
function addSecondWorkspace(c: DemoCompany, ws: SecondWorkspace): DemoCompany {
  const from = ws.sinceMonthsAgo === undefined ? "" : shiftMonth(monthKey(c.asOf), -ws.sinceMonthsAgo);
  const extra = chargesOf(c, ws.key)
    .filter((t) => monthKey(dateOf(t)) >= from)
    .flatMap((t) => {
      const date = addDays(dateOf(t), ws.dayOffset ?? 0);
      if (date > c.asOf) return [];
      const copy = withDate({ ...t, id: `${t.id}_${ws.suffix}`, money_movement_id: null }, date);
      return [ws.cents === undefined ? copy : withCents(copy, -ws.cents)];
    });
  return { ...c, transactions: [...c.transactions, ...extra], truth: copyTruth(c.truth) };
}

export const SPLIT_START_MONTHS_AGO = [2, 4, 8] as const;
export const SPLIT_SLACK_CENTS = [9_600, 18_000, 26_000] as const;
export const SPLIT_IDLE_FIGMA_CENTS = [7_500, 14_400, 18_000] as const;

const splitNotionDaniel: Apply = (c) => addSecondWorkspace(c, { key: "notion", suffix: "ho_ws_notion" });

const splitRecentLinear: Apply = (c, seed) =>
  addSecondWorkspace(c, { key: "linear", suffix: "ho_ws_linear", sinceMonthsAgo: createRng(seed ^ 0x5b01).pick(SPLIT_START_MONTHS_AGO) });

const splitSlackDifferentAmount: Apply = (c, seed) =>
  addSecondWorkspace(c, { key: "slack", suffix: "ho_ws_slack", cents: createRng(seed ^ 0x5b02).pick(SPLIT_SLACK_CENTS) });

const splitIntercomNextDay: Apply = (c) => addSecondWorkspace(c, { key: "intercom", suffix: "ho_ws_intercom", dayOffset: 1 });

const splitIdleCardFigma: Apply = (c, seed) => {
  const cents = createRng(seed ^ 0x5b03).pick(SPLIT_IDLE_FIGMA_CENTS);
  const out = addSecondWorkspace(c, { key: "figma", suffix: "ho_ws_figma", cents, dayOffset: 2 });
  return {
    ...out,
    truth: out.truth.map((w) => (w.kind === "zombie" && w.vendorKeys.includes("figma") ? { ...w, monthlyCents: w.monthlyCents + cents } : w)),
  };
};

// ---------------------------------------------------------------------------------------------
// refunded_double_charge
// ---------------------------------------------------------------------------------------------

/** The two planted Canva charges, oldest first (null if the company has no double charge). */
function canvaPair(c: DemoCompany): [RhoTransaction, RhoTransaction] | null {
  const [a, b] = chargesOf(c, "canva");
  return a && b ? [a, b] : null;
}

function refundOf(charge: RhoTransaction, cents: number, date: string, descriptor: string): RhoTransaction {
  return withDate(
    { ...charge, id: `${charge.id}_ho_refund`, money_movement_id: null, transaction_type: "card_credit", counterparty_name: descriptor, amount: { ...charge.amount, amount: cents } },
    date,
  );
}

const dropDuplicateCharge = (truth: readonly PlantedWaste[]) => copyTruth(truth).filter((w) => !(w.kind === "duplicate_charge" && w.vendorKeys.includes("canva")));

const refundNextDay: Apply = (c) => {
  const pair = canvaPair(c);
  if (!pair) return { ...c, truth: copyTruth(c.truth) };
  const [, second] = pair;
  const refund = refundOf(second, -second.amount.amount, addDays(dateOf(second), 1), second.counterparty_name);
  return { ...c, transactions: [...c.transactions, refund], truth: dropDuplicateCharge(c.truth) };
};

/** Day of month the moved duplicate pair lands on (24th and 25th), so +20 days crosses into the next month. */
export const LATE_PAIR_DAYS = [24, 25] as const;
export const LATE_REFUND_DELAY = 20;

const refundTwentyDaysAcrossMonthEnd: Apply = (c) => {
  const pair = canvaPair(c);
  if (!pair) return { ...c, truth: copyTruth(c.truth) };
  const month = monthKey(dateOf(pair[0]));
  const moved = pair.map((t, i) => withDate(t, `${month}-${LATE_PAIR_DAYS[i]}`)) as [RhoTransaction, RhoTransaction];
  const movedIds = new Map(moved.map((t) => [t.id, t]));
  const refundDate = addDays(dateOf(moved[1]), LATE_REFUND_DELAY);
  const refund = refundOf(moved[1], -moved[1].amount.amount, refundDate > c.asOf ? c.asOf : refundDate, moved[1].counterparty_name);
  return {
    ...c,
    transactions: [...c.transactions.map((t) => movedIds.get(t.id) ?? t), refund],
    truth: dropDuplicateCharge(c.truth),
  };
};

export const REFUND_DESCRIPTORS = ["CANVA REFUND", "CANVA PTY LTD CR"] as const;

const refundOtherDescriptor: Apply = (c, seed) => {
  const pair = canvaPair(c);
  if (!pair) return { ...c, truth: copyTruth(c.truth) };
  const rng = createRng(seed ^ 0x3c01);
  const descriptor = rng.pick(REFUND_DESCRIPTORS);
  const [, second] = pair;
  const date = addDays(dateOf(second), rng.int(2, 12));
  const refund = refundOf(second, -second.amount.amount, date > c.asOf ? c.asOf : date, descriptor);
  return { ...c, transactions: [...c.transactions, refund], truth: dropDuplicateCharge(c.truth) };
};

export const PARTIAL_REFUND_DELAY = 4;

const partialRefundHalf: Apply = (c) => {
  const pair = canvaPair(c);
  if (!pair) return { ...c, truth: copyTruth(c.truth) };
  const [, second] = pair;
  const charged = -second.amount.amount;
  const refunded = Math.round(charged / 2);
  const refund = refundOf(second, refunded, addDays(dateOf(second), PARTIAL_REFUND_DELAY), second.counterparty_name);
  return {
    ...c,
    transactions: [...c.transactions, refund],
    truth: copyTruth(c.truth).map((w) =>
      w.kind === "duplicate_charge" && w.vendorKeys.includes("canva")
        ? { ...w, oneTimeCents: charged - refunded, note: `${w.note} (50% refunded; remainder still unrecovered)` }
        : w,
    ),
  };
};

// ---------------------------------------------------------------------------------------------

export const HELD_OUT: readonly HeldOut[] = [
  // usage_priced
  {
    name: "usage_mild_hubspot_slack_notion",
    failureMode: "usage_priced",
    expectation:
      "HubSpot, Slack and Notion bills grow 1%/month compounding (today's bill at list price) with ±5% per-charge noise. Smooth usage growth, not price creep: no price_creep on hubspot/slack/notion. Truth unchanged.",
    apply: usageGrowth(["hubspot", "slack", "notion"], 0.01, 0.05, 0x6e01),
  },
  {
    name: "usage_heavy_gworkspace_github_loom",
    failureMode: "usage_priced",
    expectation:
      "Google Workspace, GitHub and Loom bills grow 6%/month compounding (~4x over two years, today's bill at list price) with ±25% per-charge noise. Noisy usage growth, not price creep: no price_creep on google_workspace/github/loom. Truth unchanged.",
    apply: usageGrowth(["google_workspace", "github", "loom"], 0.06, 0.25, 0x6e02),
  },
  {
    name: "usage_noise_on_datadog_step",
    failureMode: "usage_priced",
    expectation:
      "RECALL: ±12% per-charge usage noise layered on Datadog's real $2,400 → $3,600 step. The step is still a price step: price_creep datadog must still be found. Truth unchanged (keeps price_creep datadog, $1,200/mo nominal).",
    apply: usageGrowth(["datadog"], 0, 0.12, 0x6e03),
  },
  {
    name: "real_step_on_flat_vendor",
    failureMode: "usage_priced",
    expectation:
      "RECALL: a flat vendor picked per seed (Slack $480, Google Workspace $864 or Zoom $149.90) raises its list price +25% from 4 months before asOf and stays there (>= 20% and >= $25/mo). Truth ADDS price_creep [vendor] with monthlyCents = new - old ($120, $216 or $37.48).",
    apply: realPriceStep,
  },
  {
    name: "sub_floor_step_on_small_vendor",
    failureMode: "usage_priced",
    expectation:
      "Linear ($64 → $80) or 1Password ($48 → $60), per seed, +25% from 4 months before asOf: >= 20% but below the $25/month floor, so NOT price creep. Truth unchanged.",
    apply: subFloorPriceStep,
  },
  {
    name: "seat_steps_slack",
    failureMode: "usage_priced",
    expectation:
      "Slack as 12 seats x $40; one seat (+$40) added every 3-5 months (per seed) across the history, each step < 10%. Seat growth is not price creep, so truth is unchanged, but this is expected to remain a limitation (bank data can't distinguish a seat step from a price step); a price_creep slack false positive here is a known limitation, not a regression.",
    apply: seatSteps,
  },
  // split_workspaces
  {
    name: "split_ws_notion_daniel",
    failureMode: "split_workspaces",
    expectation:
      "Second Notion workspace on Daniel's (active) card: same amount, same day, every month of the history. Intentional, recurring: no duplicate_charge notion, no price_creep notion. Truth unchanged.",
    apply: splitNotionDaniel,
  },
  {
    name: "split_ws_recent_start_linear",
    failureMode: "split_workspaces",
    expectation:
      "Second Linear workspace on Daniel's card, same amount and day, started 2, 4 or 8 months before asOf (per seed). Recurring pair, not a one-off error: no duplicate_charge linear. Each charge's price is unchanged (a second stream, not a step), so no price_creep linear. Truth unchanged.",
    apply: splitRecentLinear,
  },
  {
    name: "split_ws_slack_different_amount",
    failureMode: "split_workspaces",
    expectation:
      "Second Slack workspace on Maya's card at a different fixed amount ($96, $180 or $260 per seed), same day, every month. Different amounts and recurring: no duplicate_charge slack, no price_creep slack. Truth unchanged.",
    apply: splitSlackDifferentAmount,
  },
  {
    name: "split_ws_intercom_next_day",
    failureMode: "split_workspaces",
    expectation:
      "Second Intercom workspace on Sofia's card, same amount, billed one day after the first, every month. Recurring pair one day apart, not a one-off error: no duplicate_charge intercom. Truth unchanged (Canva double charge still planted).",
    apply: splitIntercomNextDay,
  },
  {
    name: "split_ws_idle_card_figma",
    failureMode: "split_workspaces",
    expectation:
      "Second Figma workspace on Priya's idle card at a different amount ($75, $144 or $180 per seed), two days after the first, every month. Subscription, not other spend: zombie [calendly, figma, miro] still found, no duplicate_charge figma. Truth: zombie monthlyCents += the second workspace amount.",
    apply: splitIdleCardFigma,
  },
  // refunded_double_charge
  {
    name: "refund_next_day",
    failureMode: "refunded_double_charge",
    expectation: "Canva refunds the full duplicated amount one day after the second charge, same descriptor. Nothing to recover: no duplicate_charge canva. Truth drops duplicate_charge canva.",
    apply: refundNextDay,
  },
  {
    name: "refund_20_days_across_month_end",
    failureMode: "refunded_double_charge",
    expectation:
      "The Canva double charge is moved to the 24th/25th of its month and fully refunded 20 days after the second charge, landing in the next month. No duplicate_charge canva. Truth drops duplicate_charge canva.",
    apply: refundTwentyDaysAcrossMonthEnd,
  },
  {
    name: "refund_different_descriptor",
    failureMode: "refunded_double_charge",
    expectation:
      "Full refund 2-12 days after the second charge under a different descriptor ('CANVA REFUND' or 'CANVA PTY LTD CR', per seed; both resolve to canva). No duplicate_charge canva. Truth drops duplicate_charge canva.",
    apply: refundOtherDescriptor,
  },
  {
    name: "refund_partial_half",
    failureMode: "refunded_double_charge",
    expectation:
      "Canva refunds 50% of the duplicated amount 4 days after the second charge. Decided in advance: still flagged, since half is unrecovered. Truth keeps duplicate_charge canva with oneTimeCents = charge - refund ($59.99 of $119.99).",
    apply: partialRefundHalf,
  },
];
