import { beforeAll, describe, expect, it } from "vitest";
import { INSTANT_QUESTIONS, instantAnswer, instantQuestionInput, type InstantQuestion } from "@/lib/agent/instant";
import { getChanges, getFinancialSnapshot, planToTarget, runScenario } from "@/lib/agent/tools";
import { formatDollars } from "@/lib/money";
import { analyze, type Analysis } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

let a: Analysis;
beforeAll(() => {
  const demo = generateDemoCompany();
  a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
});

describe("instant answers (no LLM)", () => {
  it("answers every suggested question from tool output", () => {
    for (const q of Object.keys(INSTANT_QUESTIONS) as InstantQuestion[]) {
      const ans = instantAnswer(a, q);
      expect(ans.question).toBe(INSTANT_QUESTIONS[q]);
      expect(ans.tools.length).toBeGreaterThan(0);
      expect(ans.text).not.toMatch(/undefined|NaN|null/);
    }
  });

  it("the runway-target answer quotes the goal-seek numbers and never suggests cutting payroll", () => {
    const plan = planToTarget(a, { targetRunwayMonths: 14 });
    const text = instantAnswer(a, "target_14").text;
    expect(text).toContain(formatDollars(plan.monthlySavingsCents));
    if (!plan.reachesTarget) expect(text).toContain(formatDollars(plan.remainingGapCentsPerMonth));
    expect(text).not.toMatch(/payroll \(/);
    expect(text).toContain(`${getFinancialSnapshot(a).runwayMonths!.toFixed(1)} months`);
  });

  it("lists the planted overlaps and the double charge", () => {
    const text = instantAnswer(a, "pay_twice").text;
    expect(text).toMatch(/Salesforce/);
    expect(text).toMatch(/refund|claim back/);
  });

  it("answers the default-alive question with the projection's own numbers", () => {
    const s = runScenario(a, {});
    const text = instantAnswer(a, "default_alive").text;
    expect(text).toContain(s.defaultAlive ? "default alive" : "default dead");
    if (s.breakEvenMonth !== null) expect(text).toContain(`month ${s.breakEvenMonth}`);
    expect(text).toContain(s.revenueGrowthMeasured!);
  });

  it("lists the same changes the dashboard shows", () => {
    const text = instantAnswer(a, "what_changed").text;
    for (const c of getChanges(a)) expect(text).toContain(c.title);
  });

  it("rejects unknown question ids", () => {
    expect(instantQuestionInput.safeParse("drop_tables").success).toBe(false);
  });

  it("answers the budget question from the same numbers as the card, naming what's over first", async () => {
    const { DEMO_BUDGETS } = await import("@/lib/seed/demo-budgets");
    const { budgetStatus } = await import("@/lib/finance/budgets");
    const { formatMoney } = await import("@/lib/format");
    const rows = budgetStatus(a.txns, a.asOf, DEMO_BUDGETS, a.streams);
    const ans = instantAnswer(a, "budgets", new Set(), DEMO_BUDGETS);
    expect(ans.tools).toEqual(["get_budgets"]);
    const over = rows.find((r) => r.status === "over")!;
    expect(ans.text).toContain(`${formatMoney(over.monthToDateCents)} so far of ${formatMoney(over.monthlyCents)}`);
    expect(ans.text.indexOf("Over budget")).toBeLessThan(ans.text.indexOf("Heading over"));
    expect(instantAnswer(a, "budgets").text).toMatch(/No budgets are set/);
    expect(instantAnswer(a, "budgets", new Set(), null).text).toMatch(/sandbox has none/);
    expect(instantAnswer(a, "budgets", new Set(), "unavailable").text).toMatch(/Couldn't load your budgets/);
  });
});

describe("why did burn change", () => {
  it("answers from the burn bridge, and the lines add up to the change", async () => {
    const { generateDemoCompany: gen } = await import("@/lib/seed/demo-company");
    const demo = gen();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions });
    const { burnBridge } = await import("@/lib/finance/burn-bridge");
    const b = burnBridge(a.txns, a.asOf)!;
    const ans = instantAnswer(a, "burn_moved");
    expect(ans.tools).toEqual(["get_burn_bridge"]);
    expect(ans.text).toContain(formatDollars(b.netBurnCents));
    expect(ans.text).toContain(formatDollars(Math.abs(b.changeCents)));
    for (const d of b.drivers) expect(ans.text).toContain(d.name);
    // Too little data: says so instead of guessing.
    const short = analyze({ accounts: demo.accounts, transactions: demo.transactions.filter((t) => (t.posted_at ?? t.initiated_at) >= "2026-10-05") });
    expect(instantAnswer(short, "burn_moved").text).toMatch(/two whole months/);
  });
});

describe("who spends the most", () => {
  it("lists the demo's cardholders by card spend, from the same numbers as the card", async () => {
    const { generateDemoCompany: gen } = await import("@/lib/seed/demo-company");
    const demo = gen();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions });
    const { peopleSpend } = await import("@/lib/finance/people-spend");
    const people = peopleSpend(a.txns, a.snapshot)!;
    const ans = instantAnswer(a, "people");
    expect(ans.tools).toEqual(["get_people_spend"]);
    expect(ans.text).toContain(`**${people.rows[0]!.cardholder}**: ${formatDollars(people.rows[0]!.monthlyCents)}/month`);
  });
});

describe("what's going out", () => {
  it("totals the recurring charges scheduled in the next 30 days", async () => {
    const { generateDemoCompany: gen } = await import("@/lib/seed/demo-company");
    const demo = gen();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions });
    const { getCommitted } = await import("@/lib/agent/tools");
    const c = getCommitted(a);
    const ans = instantAnswer(a, "committed");
    expect(ans.tools).toEqual(["get_committed_spend"]);
    expect(ans.text).toContain(formatDollars(c.totalCents));
  });
});
