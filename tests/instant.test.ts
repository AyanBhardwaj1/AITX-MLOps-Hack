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

describe("who needs a 1099", () => {
  it("lists the demo's law firm and landlord from the 1099 tool, with the threshold and the caveat", async () => {
    const { get1099Prep } = await import("@/lib/agent/tools");
    const prep = get1099Prep(a)!;
    expect(prep.rows.filter((r) => r.overThreshold).map((r) => r.form).sort()).toEqual(["1099-MISC", "1099-NEC"]);
    const ans = instantAnswer(a, "form_1099");
    expect(ans.tools).toEqual(["get_1099_prep"]);
    expect(ans.text).toContain("Wilson Sonsini");
    expect(ans.text).toContain("Brazos Properties");
    expect(ans.text).toContain(formatDollars(prep.thresholdCents));
    expect(ans.text).toContain("W-9");
  });

  it("says so when no one is near the line", () => {
    const empty = { ...a, txns: a.txns.filter((t) => !["wilson_sonsini", "brazos_properties"].includes(t.vendor.key)) };
    expect(instantAnswer(empty, "form_1099").text).toMatch(/No contractor, lawyer or landlord/);
  });

  it("names payees it couldn't place, and says to mark contractors", () => {
    const year = a.asOf.slice(0, 4);
    const freelancer = { ...a.txns[0]!, id: "jane", postedAt: `${year}-02-02`, amountCents: -9_000_00, type: "ach" as const, status: "posted" as const, vendor: { key: "jane_doe", name: "Jane Doe Design", category: "other" as const, job: null, source: "fallback" as const } };
    const ans = instantAnswer({ ...a, txns: [...a.txns, freelancer] }, "form_1099").text;
    expect(ans).toContain("Jane Doe Design");
    expect(ans).toMatch(/Contractors/);
  });
});

describe("who pays us", () => {
  it("answers from the money-in tool; Stripe's payouts aren't one customer", () => {
    const ans = instantAnswer(a, "money_in");
    expect(ans.tools).toEqual(["get_money_in"]);
    expect(ans.text).toContain("Stripe payouts");
    expect(ans.text).toMatch(/many customers/);
  });

  it("names a big customer's share and runway without them", () => {
    const acme = [0, 1, 2, 3].map((i) => ({
      ...a.txns[0]!,
      id: `acme${i}`,
      postedAt: a.snapshot.burnPeriod!.from.slice(0, 8) + String(10 + i).padStart(2, "0"),
      amountCents: 500_000_00,
      type: "ach" as const,
      status: "posted" as const,
      vendor: { key: "acme_corp", name: "Acme Corp", category: "other" as const, job: null, source: "fallback" as const },
    }));
    // The snapshot is left as it was: the answer reads money in from the transactions.
    const withAcme = { ...a, txns: [...a.txns, ...acme] };
    const ans = instantAnswer(withAcme, "money_in").text;
    expect(ans).toContain("Acme Corp");
    expect(ans).toMatch(/If it stopped paying/);
  });
});

describe("dismissed findings stay dismissed", () => {
  it("'pay twice' leaves out what the team dismissed", () => {
    const doubles = a.findings.filter((f) => f.kind === "duplicate_charge" || f.kind === "duplicate_tools");
    expect(doubles.length).toBeGreaterThan(0);
    const gone = doubles[0]!;
    const text = instantAnswer(a, "pay_twice", new Set([gone.id])).text;
    expect(text).not.toContain(gone.title);
  });

  it("Copilot won't draft an action for a dismissed finding", async () => {
    const { draftAction } = await import("@/lib/agent/tools");
    const f = a.findings[0]!;
    expect(draftAction(a, { findingId: f.id, kind: "jira_ticket" }, new Set([f.id]))).toMatchObject({ error: expect.stringMatching(/dismissed/) });
  });
});

describe("budgets to start from, and spend Runway can't place", () => {
  it("suggests a budget per category from the last full months, from the same tool as the card", async () => {
    const { suggestBudgets } = await import("@/lib/finance/budgets");
    const s = suggestBudgets(a.txns, a.asOf)!;
    const ans = instantAnswer(a, "suggest_budgets");
    expect(ans.tools).toEqual(["suggest_budgets"]);
    expect(ans.text).toContain(formatDollars(s.byCategory.software!));
    expect(ans.text).toMatch(/rounded up/);
  });

  it("names uncategorised vendors, or says everything has a category", () => {
    expect(instantAnswer(a, "uncategorised").text).toMatch(/Everything (that counts in burn )?has a category/);
    const extra = [0, 1, 2].map((i) => ({ ...a.txns[0]!, id: `u${i}`, postedAt: a.snapshot.burnPeriod!.from.slice(0, 8) + "1" + i, amountCents: -9_000_00, type: "ach" as const, status: "posted" as const, vendor: { key: "mystery_llc", name: "Mystery LLC", category: "other" as const, job: null, source: "fallback" as const } }));
    const text = instantAnswer({ ...a, txns: [...a.txns, ...extra] }, "uncategorised").text;
    expect(text).toContain("Mystery LLC");
  });
});

describe("which subscriptions cost the most runway", () => {
  it("lists the biggest recurring charges with the days of runway each costs, from the same function as the table", async () => {
    const { runwayCostOf } = await import("@/lib/finance/runway");
    const { describeRunwayCost } = await import("@/lib/format");
    const top = a.streams.filter((s) => s.active).sort((x, y) => y.monthlyCostCents - x.monthlyCostCents)[0]!;
    const ans = instantAnswer(a, "runway_cost");
    expect(ans.tools).toEqual(["get_recurring_runway_cost"]);
    expect(ans.text).toContain(top.vendorName);
    expect(ans.text).toContain(describeRunwayCost(runwayCostOf(a.snapshot, top.monthlyCostCents)));
    expect(ans.text).not.toMatch(/\b\d{4,} days\b/);
  });
});

describe("dates in instant answers", () => {
  it("writes renewal dates the way the dashboard does, not as ISO", () => {
    const text = instantAnswer(a, "renewals").text;
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  });
});
