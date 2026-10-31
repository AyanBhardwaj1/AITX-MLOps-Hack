import { describe, expect, it } from "vitest";
import { monthKey, shiftMonth, daysBetween } from "@/lib/dates";
import {
  HELD_OUT,
  LATE_REFUND_DELAY,
  PARTIAL_REFUND_DELAY,
  REAL_STEP_VENDORS,
  REFUND_DESCRIPTORS,
  SPLIT_IDLE_FIGMA_CENTS,
  type HeldOut,
} from "@/lib/eval/heldout";
import { rhoTransactionSchema, type RhoTransaction } from "@/lib/rho/schema";
import { generateDemoCompany, type DemoCompany } from "@/lib/seed/demo-company";
import { resolveVendor } from "@/lib/vendors/normalize";

/** Sanity checks only: variants are well-formed and adjust truth as documented. No detector outcomes here. */

const SEEDS = [1, 7, 42] as const;
const NOISE = ["clean", "noisy"] as const;
const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const byName = (name: string): HeldOut => HELD_OUT.find((h) => h.name === name)!;
const keyOf = (t: RhoTransaction) => resolveVendor(t.counterparty_name).key;
const cases = SEEDS.flatMap((seed) => NOISE.map((noise) => ({ seed, noise, base: generateDemoCompany({ seed, noise }) })));
const refundRows = (c: DemoCompany) => c.transactions.filter((t) => t.transaction_type === "card_credit" && keyOf(t) === "canva");
const canvaCharges = (c: DemoCompany) =>
  c.transactions.filter((t) => t.transaction_type === "card_debit" && t.amount.amount < 0 && keyOf(t) === "canva").sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

describe("HELD_OUT catalogue", () => {
  it("covers every failure mode with the required minimum and unique names", () => {
    const count = (m: HeldOut["failureMode"]) => HELD_OUT.filter((h) => h.failureMode === m).length;
    expect(count("usage_priced")).toBeGreaterThanOrEqual(5);
    expect(count("split_workspaces")).toBeGreaterThanOrEqual(4);
    expect(count("refunded_double_charge")).toBeGreaterThanOrEqual(4);
    expect(new Set(HELD_OUT.map((h) => h.name)).size).toBe(HELD_OUT.length);
    for (const h of HELD_OUT) expect(h.expectation.length).toBeGreaterThan(20);
  });

  it("refund descriptors resolve to canva", () => {
    for (const d of REFUND_DESCRIPTORS) expect(resolveVendor(d).key).toBe("canva");
  });
});

describe.each(HELD_OUT.map((h) => [h.name, h] as const))("%s", (_name, h) => {
  it.each(cases.map((c) => [c.seed, c.noise, c.base] as const))("seed %i (%s) is a valid, immutable, deterministic variant", (seed, _noise, base) => {
    const snapshot = structuredClone(base);
    const out = h.apply(base, seed);

    expect(base).toEqual(snapshot);
    expect(out).not.toBe(base);
    expect(out.transactions).not.toBe(base.transactions);
    expect(out.truth).not.toBe(base.truth);
    expect(out.asOf).toBe(base.asOf);
    expect(out.transactions).not.toEqual(base.transactions);

    const ids = out.transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of out.transactions) {
      expect(rhoTransactionSchema.safeParse(t).success).toBe(true);
      expect(dateOf(t) <= out.asOf).toBe(true);
      expect(t.initiated_at.slice(0, 10) <= out.asOf).toBe(true);
    }
    expect(h.apply(base, seed)).toEqual(out);
  });
});

describe("truth adjustments", () => {
  const unchanged = [
    "usage_mild_hubspot_slack_notion",
    "usage_heavy_gworkspace_github_loom",
    "usage_noise_on_datadog_step",
    "sub_floor_step_on_small_vendor",
    "seat_steps_slack",
    "split_ws_notion_daniel",
    "split_ws_recent_start_linear",
    "split_ws_slack_different_amount",
    "split_ws_intercom_next_day",
  ];

  it.each(unchanged)("%s leaves truth unchanged", (name) => {
    for (const { seed, base } of cases) expect(byName(name).apply(base, seed).truth).toEqual(base.truth);
  });

  it("usage noise on Datadog keeps price_creep datadog in truth", () => {
    for (const { seed, base } of cases) {
      expect(byName("usage_noise_on_datadog_step").apply(base, seed).truth).toContainEqual(expect.objectContaining({ kind: "price_creep", vendorKeys: ["datadog"] }));
    }
  });

  it("real step adds price_creep for the stepped vendor with new - old monthly cents", () => {
    for (const { seed, base } of cases) {
      const out = byName("real_step_on_flat_vendor").apply(base, seed);
      const added = out.truth.slice(base.truth.length);
      expect(out.truth.slice(0, base.truth.length)).toEqual(base.truth);
      expect(added).toHaveLength(1);
      const [w] = added;
      expect(w!.kind).toBe("price_creep");
      expect(REAL_STEP_VENDORS).toContain(w!.vendorKeys[0]);
      const key = w!.vendorKeys[0]!;
      const from = shiftMonth(monthKey(out.asOf), -4);
      const amounts = (c: DemoCompany, recent: boolean) =>
        c.transactions.filter((t) => t.transaction_type === "card_debit" && keyOf(t) === key && monthKey(dateOf(t)) >= from === recent).map((t) => -t.amount.amount);
      const oldLevel = new Set(amounts(out, false));
      const newLevel = new Set(amounts(out, true));
      expect(oldLevel.size).toBe(1);
      expect(newLevel.size).toBe(1);
      const [o] = oldLevel;
      const [n] = newLevel;
      expect(w!.monthlyCents).toBe(n! - o!);
      expect(n! / o!).toBeCloseTo(1.25, 3);
      expect(w!.monthlyCents).toBeGreaterThanOrEqual(2_500);
      expect(amounts(out, false)).toEqual(amounts(base, false));
    }
  });

  it("idle-card second workspace raises the zombie monthly cents by the added amount", () => {
    for (const { seed, base } of cases) {
      const out = byName("split_ws_idle_card_figma").apply(base, seed);
      const before = base.truth.find((w) => w.kind === "zombie")!;
      const after = out.truth.find((w) => w.kind === "zombie")!;
      expect(after.vendorKeys).toEqual(before.vendorKeys);
      const delta = after.monthlyCents - before.monthlyCents;
      expect(SPLIT_IDLE_FIGMA_CENTS).toContain(delta);
      const added = out.transactions.filter((t) => t.id.endsWith("_ho_ws_figma"));
      expect(added.length).toBeGreaterThan(12);
      for (const t of added) expect(t).toMatchObject({ user_full_name: "Priya Shah", amount: { amount: -delta } });
      expect(out.truth.filter((w) => w.kind !== "zombie")).toEqual(base.truth.filter((w) => w.kind !== "zombie"));
    }
  });

  it("recent-start split only adds charges in the last 2, 4 or 8 months", () => {
    for (const { seed, base } of cases) {
      const added = byName("split_ws_recent_start_linear").apply(base, seed).transactions.filter((t) => t.id.endsWith("_ho_ws_linear"));
      const oldest = added.map((t) => monthKey(dateOf(t))).sort()[0]!;
      expect([2, 4, 8].map((k) => shiftMonth(monthKey(base.asOf), -k))).toContain(oldest);
    }
  });

  it.each(["refund_next_day", "refund_20_days_across_month_end", "refund_different_descriptor"])("%s fully refunds the duplicate and drops it from truth", (name) => {
    for (const { seed, base } of cases) {
      const out = byName(name).apply(base, seed);
      expect(out.truth).toEqual(base.truth.filter((w) => w.kind !== "duplicate_charge"));
      const [refund] = refundRows(out);
      const [, second] = canvaCharges(out);
      expect(refundRows(out)).toHaveLength(1);
      expect(refund!.amount.amount).toBe(-second!.amount.amount);
      expect(refund!.card_id).toBe(second!.card_id);
      const delay = daysBetween(dateOf(second!), dateOf(refund!));
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(20);
    }
  });

  it("refund timing and descriptors match the documented shapes", () => {
    for (const { seed, base } of cases) {
      const next = byName("refund_next_day").apply(base, seed);
      expect(daysBetween(dateOf(canvaCharges(next)[1]!), dateOf(refundRows(next)[0]!))).toBe(1);

      const late = byName("refund_20_days_across_month_end").apply(base, seed);
      const [first, second] = canvaCharges(late);
      const refund = refundRows(late)[0]!;
      expect(daysBetween(dateOf(second!), dateOf(refund))).toBe(LATE_REFUND_DELAY);
      expect(monthKey(dateOf(first!))).toBe(monthKey(dateOf(second!)));
      expect(monthKey(dateOf(refund)) > monthKey(dateOf(second!))).toBe(true);
      expect(daysBetween(dateOf(first!), dateOf(second!))).toBe(1);

      const other = refundRows(byName("refund_different_descriptor").apply(base, seed))[0]!;
      expect(REFUND_DESCRIPTORS).toContain(other.counterparty_name);
    }
  });

  it("partial refund keeps duplicate_charge with the unrecovered half", () => {
    for (const { seed, base } of cases) {
      const out = byName("refund_partial_half").apply(base, seed);
      const [, second] = canvaCharges(out);
      const refund = refundRows(out)[0]!;
      const charged = -second!.amount.amount;
      expect(refund.amount.amount).toBe(Math.round(charged / 2));
      expect(daysBetween(dateOf(second!), dateOf(refund))).toBe(PARTIAL_REFUND_DELAY);
      const dup = out.truth.find((w) => w.kind === "duplicate_charge")!;
      expect(dup.vendorKeys).toEqual(["canva"]);
      expect(dup.oneTimeCents).toBe(charged - refund.amount.amount);
      expect(dup.oneTimeCents).toBe(5_999);
      expect(out.truth.filter((w) => w.kind !== "duplicate_charge")).toEqual(base.truth.filter((w) => w.kind !== "duplicate_charge"));
    }
  });
});
