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

  it("reads a card's OFX (QFX/QBO) download beside a checking CSV, with the same runway", () => {
    const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    const card = settled.filter((t) => t.account_type === "credit");
    const ofx = [
      "OFXHEADER:100",
      "DATA:OFXSGML",
      "VERSION:102",
      "",
      "<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>USD<CCACCTFROM><ACCTID>4111111111114321</CCACCTFROM><BANKTRANLIST>",
      ...card.map((t, i) => `<STMTTRN>\n<TRNTYPE>${t.amount.amount < 0 ? "DEBIT" : "CREDIT"}\n<DTPOSTED>${dateOf(t).replaceAll("-", "")}\n<TRNAMT>${(t.amount.amount / 100).toFixed(2)}\n<FITID>${i}\n<NAME>${esc(t.counterparty_name)}\n</STMTTRN>`),
      "</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>",
    ].join("\n");
    const g = gradeCsvFiles([{ name: "checking.csv", text: generic(settled.filter((t) => t.account_type === "checking")) }, { name: "card.qfx", text: ofx }], cash);
    expect(Math.abs(g.runwayMonths - api.snapshot.runwayMonths)).toBeLessThan(0.25);
    expect(g.notes.join(" ")).not.toMatch(/weren't uploaded|couldn't be read/);
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

  it("says when one export stops weeks before the others, since its spending since is missing", () => {
    const card = demo.transactions.filter((t) => t.account_type === "credit");
    const checking = demo.transactions.filter((t) => t.account_type !== "credit");
    const latest = checking.map(dateOf).sort().at(-1)!;
    const cutoff = new Date(Date.parse(`${latest}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const early = card.filter((t) => dateOf(t) <= cutoff);
    const g = gradeCsvFiles([{ name: "checking.csv", text: mercuryCsv(checking) }, { name: "amex.csv", text: mercuryCsv(early) }], cash);
    expect(g.notes.some((n) => /^The amex export ends .*days before the newest one/.test(n))).toBe(true);
    // Both up to date: nothing to say.
    const full = gradeCsvFiles([{ name: "checking.csv", text: mercuryCsv(checking) }, { name: "amex.csv", text: mercuryCsv(card) }], cash);
    expect(full.notes.some((n) => /days before the newest one/.test(n))).toBe(false);
    // Monthly statements of one account are one account, not five lagging files.
    const byMonth = new Map<string, RhoTransaction[]>();
    for (const t of checking) byMonth.set(dateOf(t).slice(0, 7), [...(byMonth.get(dateOf(t).slice(0, 7)) ?? []), t]);
    const statements = [...byMonth].slice(-6).map(([m, rows]) => ({ name: `checking-${m}.csv`, text: mercuryCsv(rows) }));
    expect(gradeCsvFiles(statements, cash).notes.some((n) => /days before the newest one/.test(n))).toBe(false);
    // Banks' default names (activity.csv, transactions.csv) say nothing about the account: kept apart.
    const banks = gradeCsvFiles([{ name: "transactions.csv", text: mercuryCsv(checking) }, { name: "activity.csv", text: mercuryCsv(early) }], cash);
    expect(banks.notes.some((n) => /^The activity\.csv export ends .*days before the newest one/.test(n))).toBe(true);
    // Two exports of one account that overlap partly (they share rows) are one account.
    const ytd = checking.filter((t) => dateOf(t) <= cutoff);
    const recentStart = new Date(Date.parse(`${cutoff}T00:00:00Z`) - 25 * 86_400_000).toISOString().slice(0, 10);
    const partial = gradeCsvFiles([{ name: "checking-ytd.csv", text: mercuryCsv(ytd) }, { name: "checking-recent.csv", text: mercuryCsv(checking.filter((t) => dateOf(t) >= recentStart)) }], cash);
    expect(partial.notes.some((n) => /days before the newest one/.test(n))).toBe(false);
    // One coincidental shared row (a $15 fee on both) doesn't make two named accounts one.
    const fee = { ...checking[0]!, id: "fee", counterparty_name: "MONTHLY SERVICE FEE", amount: { amount: -1_500, currency: "USD" }, initiated_at: "2026-03-01T12:00:00Z", posted_at: "2026-03-01T12:00:00Z" } as RhoTransaction;
    const coincidence = gradeCsvFiles([{ name: "checking.csv", text: mercuryCsv([...checking, fee]) }, { name: "amex.csv", text: mercuryCsv([...early, fee]) }], cash);
    expect(coincidence.notes.some((n) => /^The amex export ends/.test(n))).toBe(true);
    // An older export overlapping a newer one of the same account adds nothing, so says nothing.
    const older = checking.filter((t) => dateOf(t) <= cutoff);
    const overlap = gradeCsvFiles([{ name: "old.csv", text: mercuryCsv(older) }, { name: "new.csv", text: mercuryCsv(checking) }], cash);
    expect(overlap.notes.some((n) => /days before the newest one/.test(n))).toBe(false);
  });
});
