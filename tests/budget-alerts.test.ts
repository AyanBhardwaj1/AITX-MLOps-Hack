import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/store/memory";
import type { Analysis } from "@/lib/pipeline";
import type { EnrichedTxn } from "@/lib/types";

vi.mock("server-only", () => ({}));

const { budgetAlertText, sendBudgetAlerts } = await import("@/lib/server/budget-alerts");

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"]): EnrichedTxn =>
  ({ id, accountId: "chk", postedAt, amountCents, description: id, type: "card", status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as EnrichedTxn;

// November 10: software $9,000 spent of $8,500 (over), travel $900 of $5,000 (heading over isn't an alert).
const analysis = {
  asOf: "2026-11-10",
  txns: [txn("s1", "2026-11-02", -6_000_00, "software"), txn("s2", "2026-11-09", -3_000_00, "software"), txn("t1", "2026-11-03", -900_00, "travel"), txn("m1", "2026-11-04", -300_00, "meals")],
  streams: [],
} as unknown as Analysis;
const NOW = new Date("2026-11-10T15:00:00Z");
const WEBHOOK = "https://hooks.slack.com/services/T000/B000/XXXX";

type BudgetList = readonly (readonly [Parameters<ReturnType<typeof createMemoryStore>["setBudget"]>[0], number])[];
const BUDGETS: BudgetList = [["software", 8_500_00], ["travel", 5_000_00], ["meals", 200_00]];

async function companyWith({ slack = true, budgets = BUDGETS }: { slack?: boolean; budgets?: BudgetList } = {}) {
  const store = createMemoryStore();
  if (slack) await store.setSlackWebhook(WEBHOOK);
  for (const [category, cents] of budgets) await store.setBudget(category, cents);
  return store;
}

describe("budget alerts in Slack", () => {
  it("posts once when budgets first go over this month, naming each one", async () => {
    const store = await companyWith();
    const post = vi.fn(async () => undefined);
    const load = vi.fn(async () => analysis);
    expect(await sendBudgetAlerts({ store, load, company: "Acme <Robotics>", now: NOW, post })).toEqual({ status: "sent", categories: ["meals", "software"] });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, text] = post.mock.calls[0] as unknown as [string, string];
    expect(url).toBe(WEBHOOK);
    expect(text).toContain("Acme &lt;Robotics&gt;");
    expect(text).toContain("*Software* is over budget: $9,000 so far of $8,500 in November.");
    expect(text).toContain("*Meals* is over budget: $300 so far of $200 in November.");
    expect(text).not.toContain("Travel");
    // The next run (or an overlapping one) has nothing new to say.
    expect(await sendBudgetAlerts({ store, load, company: "Acme", now: NOW, post })).toEqual({ status: "none" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("doesn't read the company's data without a Slack channel or a budget", async () => {
    const load = vi.fn(async () => analysis);
    const post = vi.fn(async () => undefined);
    expect(await sendBudgetAlerts({ store: await companyWith({ slack: false }), load, company: "Acme", now: NOW, post })).toEqual({ status: "no_slack" });
    expect(await sendBudgetAlerts({ store: await companyWith({ budgets: [] }), load, company: "Acme", now: NOW, post })).toEqual({ status: "none" });
    expect(load).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("stays quiet about a month that's already over (old uploads)", async () => {
    const post = vi.fn(async () => undefined);
    const result = await sendBudgetAlerts({ store: await companyWith(), load: async () => analysis, company: "Acme", now: new Date("2026-12-02T15:00:00Z"), post });
    expect(result).toEqual({ status: "none" });
    expect(post).not.toHaveBeenCalled();
  });

  it("tries again next run when Slack refuses, and disconnects a webhook Slack removed", async () => {
    const { SlackError } = await import("@/lib/slack");
    const store = await companyWith();
    const down = vi.fn(async () => {
      throw new SlackError(500, "oops");
    });
    await expect(sendBudgetAlerts({ store, load: async () => analysis, company: "Acme", now: NOW, post: down })).rejects.toThrow(/500/);
    const ok = vi.fn(async () => undefined);
    expect(await sendBudgetAlerts({ store, load: async () => analysis, company: "Acme", now: NOW, post: ok })).toEqual({ status: "sent", categories: ["meals", "software"] });

    const gone = await companyWith();
    const removed = vi.fn(async () => {
      throw new SlackError(404, "no_service");
    });
    expect(await sendBudgetAlerts({ store: gone, load: async () => analysis, company: "Acme", now: NOW, post: removed })).toEqual({ status: "disconnected" });
    expect(await gone.getSlackWebhook()).toBeNull();
  });

  it("writes plain amounts and a link back when there is one", () => {
    const text = budgetAlertText({
      company: "Acme",
      month: "2026-11",
      rows: [
        { category: "ai_api", monthlyCents: 2_000_00, monthToDateCents: 2_412_34, projectedCents: 5_000_00, lastMonthCents: 0, status: "over" },
        { category: "legal_accounting", monthlyCents: 1_000_00, monthToDateCents: 1_500_00, projectedCents: 1_500_00, lastMonthCents: 0, status: "over" },
      ],
      link: "https://runway.example/app?mode=company",
    });
    expect(text).toBe(
      "*Budget alert for Acme*\n• *AI APIs* is over budget: $2,412.34 so far of $2,000 in November.\n• *Legal &amp; accounting* is over budget: $1,500 so far of $1,000 in November.\n<https://runway.example/app?mode=company|See budgets in Runway>",
    );
  });
});
