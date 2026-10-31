import { describe, expect, it } from "vitest";
import type { MonthHistory } from "@/lib/finance/history";
import { estimateRevenueGrowth, estimateRevenueGrowthDetail, projectScenario, type ScenarioInput } from "@/lib/finance/scenario";

const month = (i: number) => `2026-${String(i + 1).padStart(2, "0")}`;
/** Six months of history with revenue growing by `g` a month and flat spend. */
function history(revenueStartCents: number, g: number, outflowCents: number, months = 6): MonthHistory[] {
  return Array.from({ length: months }, (_, i) => ({
    month: month(i),
    inflowCents: Math.round(revenueStartCents * (1 + g) ** i),
    outflowCents,
    softwareCents: 0,
  }));
}

const base = (over: Partial<ScenarioInput> = {}): ScenarioInput => ({
  asOf: "2026-07-15",
  cashCents: 1_000_000_00,
  history: history(20_000_00, 0.1, 100_000_00),
  ...over,
});

describe("estimateRevenueGrowth", () => {
  it("recovers a steady compound growth rate", () => {
    expect(estimateRevenueGrowth(history(10_000_00, 0.08, 1))).toBeCloseTo(0.08, 3);
  });

  it("is 0 with no revenue or too little history", () => {
    expect(estimateRevenueGrowth(history(0, 0.1, 1))).toBe(0);
    expect(estimateRevenueGrowth(history(10_000_00, 0.1, 1, 2))).toBe(0);
  });

  it("measures growth over the most recent run of revenue months, not from zero", () => {
    const h = history(10_000_00, 0.1, 1);
    h[2] = { ...h[2]!, inflowCents: 0 };
    expect(estimateRevenueGrowth(h)).toBeCloseTo(0.1, 3);
    const recentStart = [0, 0, 0, 1_000_00, 2_000_00, 4_000_00].map((inflowCents, i) => ({ month: month(i), inflowCents, outflowCents: 1, softwareCents: 0 }));
    expect(estimateRevenueGrowthDetail(recentStart)).toMatchObject({ months: 3, clamped: true });
  });

  it("reports when the estimate was capped or there wasn't enough revenue history", () => {
    expect(estimateRevenueGrowthDetail(history(1_00, 2, 1))).toMatchObject({ rate: 0.3, clamped: true, months: 6 });
    const late = [0, 0, 0, 0, 5_000_00, 6_000_00].map((inflowCents, i) => ({ month: month(i), inflowCents, outflowCents: 1, softwareCents: 0 }));
    expect(estimateRevenueGrowthDetail(late)).toMatchObject({ rate: 0, months: 0 });
  });

  it("clamps implausible rates", () => {
    expect(estimateRevenueGrowth(history(1_00, 2, 1))).toBe(0.3);
    expect(estimateRevenueGrowth(history(100_000_00, -0.6, 1))).toBe(-0.2);
  });

  it("uses only the last six months", () => {
    const h = [...history(5_000_00, 0.5, 1, 6), ...history(20_000_00, 0.05, 1, 6)];
    expect(estimateRevenueGrowth(h)).toBeCloseTo(0.05, 3);
  });
});

describe("projectScenario", () => {
  it("baseline uses the last three months' averages as the starting point", () => {
    const s = projectScenario(base({ revenueGrowth: 0 }));
    const avgIn = (20_000_00 * (1.1 ** 3 + 1.1 ** 4 + 1.1 ** 5)) / 3;
    expect(s.baseRevenueCents).toBe(Math.round(avgIn));
    expect(s.baseExpensesCents).toBe(100_000_00);
  });

  it("with flat revenue it is default dead and runs out when cash does", () => {
    const s = projectScenario(base({ revenueGrowth: 0 }));
    expect(s.defaultAlive).toBe(false);
    expect(s.breakEvenMonth).toBeNull();
    const burn = s.baseExpensesCents - s.baseRevenueCents;
    expect(s.runOutMonths).toBeCloseTo(1_000_000_00 / burn, 1);
    expect(s.zeroCashDate).not.toBeNull();
  });

  it("is default alive when revenue reaches expenses before cash runs out", () => {
    const s = projectScenario(base({ cashCents: 5_000_000_00, revenueGrowth: 0.1 }));
    expect(s.defaultAlive).toBe(true);
    expect(s.breakEvenMonth).not.toBeNull();
    expect(s.runOutMonths).toBeNull();
    expect(s.zeroCashDate).toBeNull();
  });

  it("finds the minimum growth that makes the company default alive", () => {
    const s = projectScenario(base({ revenueGrowth: 0 }));
    expect(s.growthNeededForDefaultAlive).not.toBeNull();
    const g = s.growthNeededForDefaultAlive!;
    expect(projectScenario(base({ revenueGrowth: g })).defaultAlive).toBe(true);
    expect(projectScenario(base({ revenueGrowth: g - 0.005 })).defaultAlive).toBe(false);
  });

  it("reports no achievable growth when even 30%/mo isn't enough", () => {
    const s = projectScenario(base({ cashCents: 1_000_00, history: history(1_00, 0, 100_000_00) }));
    expect(s.growthNeededForDefaultAlive).toBeNull();
  });

  it("hires never lengthen runway and start in their month", () => {
    const without = projectScenario(base({ revenueGrowth: 0 }));
    const withHire = projectScenario(base({ revenueGrowth: 0, hires: [{ monthlyCostCents: 15_000_00, startMonth: 3, count: 2 }] }));
    expect(withHire.runOutMonths!).toBeLessThan(without.runOutMonths!);
    expect(withHire.points[1]!.expensesCents).toBe(without.points[1]!.expensesCents);
    expect(withHire.points[3]!.expensesCents).toBe(without.points[3]!.expensesCents + 30_000_00);
  });

  it("a raise and monthly cuts never shorten runway", () => {
    const without = projectScenario(base({ revenueGrowth: 0 }));
    const raised = projectScenario(base({ revenueGrowth: 0, raise: { amountCents: 2_000_000_00, month: 6 } }));
    const cut = projectScenario(base({ revenueGrowth: 0, monthlyCutsCents: 10_000_00 }));
    expect(raised.runOutMonths!).toBeGreaterThan(without.runOutMonths!);
    expect(cut.runOutMonths!).toBeGreaterThan(without.runOutMonths!);
    expect(raised.points[6]!.cashCents - raised.points[5]!.cashCents).toBeGreaterThan(1_000_000_00);
  });

  it("a raise after cash has already run out doesn't revive the company", () => {
    const s = projectScenario(base({ cashCents: 100_000_00, revenueGrowth: 0, raise: { amountCents: 10_000_000_00, month: 30 } }));
    expect(s.runOutMonths!).toBeLessThan(30);
  });

  it("expense growth shortens runway", () => {
    const flat = projectScenario(base({ revenueGrowth: 0 }));
    const growing = projectScenario(base({ revenueGrowth: 0, expenseGrowth: 0.03 }));
    expect(growing.runOutMonths!).toBeLessThan(flat.runOutMonths!);
  });

  it("is already profitable: default alive from month 0 with no run-out", () => {
    const s = projectScenario(base({ history: history(200_000_00, 0, 100_000_00), revenueGrowth: 0 }));
    expect(s.defaultAlive).toBe(true);
    expect(s.breakEvenMonth).toBe(0);
    expect(s.runOutMonths).toBeNull();
  });

  it("is deterministic and caps the horizon", () => {
    const a = projectScenario(base());
    expect(projectScenario(base())).toEqual(a);
    expect(a.points.length).toBeLessThanOrEqual(61);
  });

  it("a break-even that doesn't last is not default alive (falling revenue)", () => {
    const s = projectScenario(base({ cashCents: 5_000_000_00, history: history(110_000_00, 0, 100_000_00), revenueGrowth: -0.05 }));
    expect(s.defaultAlive).toBe(false);
    expect(s.breakEvenMonth).toBeNull();
  });

  it("later hires that push the company back into losses make it default dead, even with years of cash", () => {
    const s = projectScenario(base({ cashCents: 5_000_000_00, history: history(100_000_00, 0, 90_000_00), revenueGrowth: 0, hires: [{ monthlyCostCents: 15_000_00, startMonth: 3, count: 5 }] }));
    expect(s.defaultAlive).toBe(false);
  });

  it("break-even is the start of the profitable run that lasts", () => {
    const s = projectScenario(base({ cashCents: 5_000_000_00, revenueGrowth: 0.1 }));
    const be = s.breakEvenMonth!;
    expect(s.points.slice(be).every((p) => p.revenueCents >= p.expensesCents)).toBe(true);
    expect(s.points[be - 1]!.revenueCents).toBeLessThan(s.points[be - 1]!.expensesCents);
  });

  it("rejects nonsense inputs", () => {
    expect(() => projectScenario(base({ hires: [{ monthlyCostCents: -1, startMonth: 0, count: 1 }] }))).toThrow();
    expect(() => projectScenario(base({ raise: { amountCents: 1, month: -2 } }))).toThrow();
  });
});
