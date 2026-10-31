import { describe, expect, it } from "vitest";
import { gradeCsvFiles } from "@/lib/grader";
import { analyze } from "@/lib/pipeline";
import { cashBalanceCents } from "@/lib/rho/map";
import type { RhoTransaction } from "@/lib/rho/schema";
import { generateDemoCompany } from "@/lib/seed/demo-company";

const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const q = (s: string) => (/[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
function mercuryCsv(rows: readonly RhoTransaction[]) {
  return ["Date (UTC),Description,Amount,Status,Source Account,Name On Card", ...rows.filter((t) => t.status === "settled").map((t) => {
    const d = dateOf(t);
    return [`${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`, t.counterparty_name, (t.amount.amount / 100).toFixed(2), "Sent", t.account_id, t.user_full_name ?? ""].map(q).join(",");
  })].join("\n");
}

describe("gradeCsvFiles", () => {
  const demo = generateDemoCompany();
  const cash = cashBalanceCents(demo.accounts);
  const api = analyze({ accounts: demo.accounts, transactions: demo.transactions });

  it("matches the connected-account runway and waste for a full export", () => {
    const g = gradeCsvFiles([{ name: "mercury.csv", text: mercuryCsv(demo.transactions) }], cash);
    expect(g.runwayMonths).toBeCloseTo(api.snapshot.runwayMonths, 1);
    expect(g.wasteMonthlyCents).toBe(api.findings.reduce((s, f) => s + f.monthlySavingsCents, 0));
    expect(g.topFindings[0]!.monthlySavingsCents).toBeGreaterThanOrEqual(g.topFindings.at(-1)!.monthlySavingsCents);
    expect(g.range.p10).toBeLessThanOrEqual(g.range.p90);
    expect(g.notes).toEqual([]);
  });

  it("says plainly when the upload can't see card waste or per-person cards", () => {
    const checking = demo.transactions.filter((t) => t.account_type === "checking");
    const generic = ["date,description,amount", ...checking.filter((t) => t.status === "settled").map((t) => [dateOf(t), q(t.counterparty_name), (t.amount.amount / 100).toFixed(2)].join(","))].join("\n");
    const g = gradeCsvFiles([{ name: "checking.csv", text: generic }], cash);
    expect(g.notes.join(" ")).toMatch(/card's own transactions/);
    expect(g.notes.join(" ")).toMatch(/cardholder/);
    expect(g.runwayMonths).toBeCloseTo(api.snapshot.runwayMonths, 0);
  });

  it("reports unreadable files and rows instead of failing silently", () => {
    const g = gradeCsvFiles([{ name: "junk.csv", text: "foo,bar\n1,2" }, { name: "ok.csv", text: "date,description,amount\n2026-09-05,ZOOM.US,-149.90\nbad,ZOOM,1\n" }], 100_000_00);
    expect(g.errors).toEqual([expect.stringContaining("junk.csv")]);
    expect(g.notes.join(" ")).toMatch(/1 row/);
  });

  it("refuses to run without data or a cash balance", () => {
    expect(() => gradeCsvFiles([], 1)).toThrow(/file/);
    expect(() => gradeCsvFiles([{ name: "a.csv", text: "date,description,amount\n2026-09-05,ZOOM.US,-149.90\n" }], Number.NaN)).toThrow(/cash/);
  });

  const settled = demo.transactions.filter((t) => t.status === "settled");
  const generic = (rows: readonly RhoTransaction[]) => ["date,description,amount", ...rows.map((t) => [dateOf(t), q(t.counterparty_name), (t.amount.amount / 100).toFixed(2)].join(","))].join("\n");

  it("gets runway right for a checking export plus the card's export (review round 1)", () => {
    const g = gradeCsvFiles(
      [
        { name: "checking.csv", text: generic(settled.filter((t) => t.account_type === "checking")) },
        { name: "card.csv", text: mercuryCsv(settled.filter((t) => t.account_type === "credit")) },
      ],
      cash,
    );
    expect(Math.abs(g.runwayMonths - api.snapshot.runwayMonths)).toBeLessThan(0.25);
    expect(g.notes.join(" ")).not.toMatch(/weren't uploaded/);
  });

  it("ignores the same file uploaded twice and rows repeated across overlapping exports", () => {
    const text = mercuryCsv(demo.transactions);
    const g = gradeCsvFiles([{ name: "a.csv", text }, { name: "a-copy.csv", text }], cash);
    expect(Math.abs(g.runwayMonths - api.snapshot.runwayMonths)).toBeLessThan(0.25);
    expect(g.notes.join(" ")).toMatch(/duplicate/i);
  });

  it("doesn't drop credit-card spend when a checking export has named debit-card rows (review round 2)", () => {
    // Checking export (Mercury-style) whose debit-card purchases carry a name, plus credit-card payoffs.
    const checking = settled.filter((t) => t.account_type === "checking").map((t, i) => (i % 25 === 0 && t.amount.amount < 0 && t.transaction_type === "ach_debit" ? { ...t, user_full_name: "Maya Thompson" } : t));
    const g = gradeCsvFiles([{ name: "checking.csv", text: mercuryCsv(checking) }], cash);
    expect(Math.abs(g.runwayMonths - api.snapshot.runwayMonths)).toBeLessThan(0.25);
    expect(g.notes.join(" ")).toMatch(/weren't uploaded/);
  });

  it("keeps every finding when one account is exported as two date ranges (review round 2)", () => {
    const sorted = [...demo.transactions].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const mid = Math.floor(sorted.length / 2);
    const g = gradeCsvFiles([{ name: "jan-jun.csv", text: mercuryCsv(sorted.slice(0, mid)) }, { name: "jul-dec.csv", text: mercuryCsv(sorted.slice(mid)) }], cash);
    expect(g.wasteMonthlyCents).toBe(api.findings.reduce((s, f) => s + f.monthlySavingsCents, 0));
    expect(Math.abs(g.runwayMonths - api.snapshot.runwayMonths)).toBeLessThan(0.25);
  });
});
