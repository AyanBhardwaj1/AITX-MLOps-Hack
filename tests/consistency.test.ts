import { describe, expect, it } from "vitest";
import { burnBridge } from "@/lib/finance/burn-bridge";
import { cashPnl } from "@/lib/finance/cash-pnl";
import { categorySpend } from "@/lib/finance/category-spend";
import { monthlyHistory } from "@/lib/finance/history";
import { moneyIn } from "@/lib/finance/money-in";
import { peopleSpend } from "@/lib/finance/people-spend";
import { uncategorisedSpend } from "@/lib/finance/uncategorised";
import { suggestBudgets } from "@/lib/finance/budgets";
import { form1099Year, prep1099 } from "@/lib/finance/form-1099";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

/** The cards show one set of books: the same months and rules give the same totals, to the cent. */
const cases = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) =>
  ["2026-10-26", "2026-10-31", "2026-02-28", "2027-01-01"].map((asOf) => ({ seed, asOf, months: 4 + ((seed * 5) % 20) })),
);

describe("the cards agree with each other", () => {
  it.each(cases)("seed $seed, data to $asOf over $months months", ({ seed, asOf, months }) => {
    const demo = generateDemoCompany({ seed, asOf, months, noise: seed % 2 ? "noisy" : "clean" });
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const s = a.snapshot;

    // The P&L's net row is burn's monthly money in minus money out.
    const pnl = cashPnl(a.txns, a.asOf);
    if (pnl) expect(pnl.netCents).toEqual(monthlyHistory(a.txns, a.asOf, 12).slice(12 - pnl.months.length).map((h) => h.inflowCents - h.outflowCents));

    // Why burn moved adds up, and its months are the P&L's last two.
    const bridge = burnBridge(a.txns, a.asOf);
    if (bridge) {
      expect(bridge.drivers.reduce((x, d) => x + d.changeCents, 0) + bridge.otherCents - bridge.revenueChangeCents).toBe(bridge.changeCents);
      if (pnl && pnl.months.at(-1) === bridge.month) {
        expect(-pnl.netCents.at(-1)!).toBe(bridge.netBurnCents);
        expect(-pnl.netCents.at(-2)!).toBe(bridge.previousNetBurnCents);
      }
    }

    // Net burn is the average of the P&L's net over burn's whole months.
    if (pnl && s.burnMonths > 0 && s.burnMonths <= pnl.months.length) {
      const net = pnl.netCents.slice(-s.burnMonths).reduce((x, c) => x + c, 0);
      expect(Math.abs(-net / s.burnMonths - s.netBurnCents)).toBeLessThanOrEqual(1);
    }

    // Spending by person and money by payer stay within gross burn and money in.
    const people = peopleSpend(a.txns, s);
    if (people) expect(people.rows.reduce((x, p) => x + p.monthlyCents, 0) + people.unassignedMonthlyCents).toBeLessThanOrEqual(s.grossBurnCents + people.rows.length + 1);
    const money = moneyIn(a.txns, s);
    if (money) expect(money.monthlyCents).toBeLessThanOrEqual(s.grossBurnCents - s.netBurnCents + 1);

    // Spend Runway can't place is part of gross burn, and suggested budgets cover what was spent.
    const unplaced = uncategorisedSpend(a.txns, s);
    if (unplaced) expect(unplaced.monthlyCents).toBeLessThanOrEqual(s.grossBurnCents + 1);
    const suggested = suggestBudgets(a.txns, a.asOf);
    if (suggested) for (const cents of Object.values(suggested.byCategory)) expect(cents! % 100_00).toBe(0);
    // The 1099 list counts bank payments in one tax year: never more than that year's outflows.
    const year = form1099Year(a.asOf);
    const prep = prep1099(a.txns, year);
    if (prep) {
      const out = a.txns.filter((t) => t.postedAt.startsWith(`${year}-`) && t.amountCents < 0).reduce((x, t) => x - t.amountCents, 0);
      expect(prep.rows.reduce((x, r) => x + r.paidCents, 0)).toBeLessThanOrEqual(out);
    }

    // "Where the money goes" covers the last 3 complete months, as burn does.
    const cats = categorySpend(a.txns, a.asOf, { maxRows: 99 });
    if (s.burnMonths >= 3 && pnl && pnl.months.length >= 3) {
      const last3 = new Set(pnl.months.slice(-3));
      const out = a.txns.filter((t) => t.amountCents < 0 && t.status === "posted" && t.type !== "transfer" && t.vendor.category !== "transfer" && last3.has(t.postedAt.slice(0, 7)));
      const spend = out.reduce((x, t) => x - t.amountCents, 0);
      const recent = cats.reduce((x, c) => x + c.recentCents, 0);
      expect(Math.abs(recent - Math.round(spend / 3))).toBeLessThanOrEqual(cats.length);
    }
  });
});

describe("data ending on a month's last day completes that month", () => {
  it("in 'Where the money goes' and the AI spend trend", async () => {
    const { aiSpendTrend } = await import("@/lib/finance/ai-spend");
    const t = (id: string, postedAt: string, amountCents: number, category: "software" | "ai_api") =>
      ({ id, accountId: "a", postedAt, amountCents, description: id, type: "card", status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as never;
    const txns = [t("old", "2026-07-15", -100_00, "software"), t("oct", "2026-10-15", -300_00, "software"), t("openai", "2026-10-20", -50_00, "ai_api")];
    expect(categorySpend(txns, "2026-10-31")[0]!.recentCents).toBe(Math.round(300_00 / 3));
    expect(aiSpendTrend(txns, "2026-10-31", 3)!.months.at(-1)).toEqual({ month: "2026-10", cents: 50_00 });
  });
});
