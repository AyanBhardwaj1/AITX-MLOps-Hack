import { describe, expect, it } from "vitest";
import { categorySpend } from "@/lib/finance/category-spend";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"], extra: Partial<EnrichedTxn> = {}): EnrichedTxn =>
  ({
    id,
    postedAt,
    amountCents,
    status: "posted",
    type: "card",
    description: id,
    accountId: "a",
    vendor: { key: id, name: id, category, job: null, source: "catalog" },
    ...extra,
  }) as EnrichedTxn;

describe("categorySpend", () => {
  // asOf 2026-10-26: recent = Jul, Aug, Sep; prior = Apr, May, Jun.
  const txns = [
    txn("s1", "2026-04-10", -30_000, "software"),
    txn("s2", "2026-07-10", -60_000, "software"),
    txn("s3", "2026-09-10", -30_000, "software"),
    txn("p1", "2026-05-01", -900_000, "payroll"),
    txn("p2", "2026-08-01", -900_000, "payroll"),
    txn("r1", "2026-08-03", 5_000_000, "revenue"),
    txn("t1", "2026-08-05", -2_000_000, "transfer"),
    txn("x1", "2026-08-06", -100_000, "meals", { status: "pending" } as Partial<EnrichedTxn>),
    txn("old", "2026-01-01", -999_999, "rent"),
    txn("now", "2026-10-02", -999_999, "rent"),
  ];

  it("averages monthly spend per category over the last 3 complete months and the 3 before", () => {
    const rows = categorySpend(txns, "2026-10-26");
    expect(rows.find((r) => r.category === "software")).toEqual({ category: "software", recentCents: 30_000, priorCents: 10_000 });
    expect(rows.find((r) => r.category === "payroll")).toEqual({ category: "payroll", recentCents: 300_000, priorCents: 300_000 });
  });

  it("counts only burn: no income, transfers, pending charges, or months outside the two windows", () => {
    const cats = categorySpend(txns, "2026-10-26").map((r) => r.category);
    expect(cats).not.toContain("revenue");
    expect(cats).not.toContain("transfer");
    expect(cats).not.toContain("meals");
    expect(cats).not.toContain("rent");
  });

  it("orders categories by recent spend, largest first", () => {
    expect(categorySpend(txns, "2026-10-26").map((r) => r.category)).toEqual(["payroll", "software"]);
  });

  it("folds the long tail into one 'other categories' row so the chart stays readable", () => {
    const many = Array.from({ length: 12 }, (_, i) => txn(`c${i}`, "2026-08-10", -(i + 1) * 10_000, (["payroll", "rent", "software", "cloud", "ai_api", "marketing", "travel", "meals", "contractors", "legal_accounting", "insurance", "hardware"] as const)[i]!));
    const rows = categorySpend(many, "2026-10-26", { maxRows: 6 });
    expect(rows).toHaveLength(6);
    expect(rows.at(-1)!.category).toBe("rest");
    const total = (rs: typeof rows) => rs.reduce((s, r) => s + r.recentCents, 0);
    expect(total(rows)).toBe(total(categorySpend(many, "2026-10-26", { maxRows: 99 })));
  });
});
