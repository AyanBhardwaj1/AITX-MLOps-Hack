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
    expect(text).toContain(`${s.revenueGrowthPctPerMonth.toFixed(1)}%/month`);
  });

  it("lists the same changes the dashboard shows", () => {
    const text = instantAnswer(a, "what_changed").text;
    for (const c of getChanges(a)) expect(text).toContain(c.title);
  });

  it("rejects unknown question ids", () => {
    expect(instantQuestionInput.safeParse("drop_tables").success).toBe(false);
  });
});
