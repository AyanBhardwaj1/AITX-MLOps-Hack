import { describe, expect, it } from "vitest";
import { PAGE_SIZE, parseTxnQuery, searchTransactions } from "@/lib/finance/transaction-search";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, name: string, category: EnrichedTxn["vendor"]["category"], extra: Partial<EnrichedTxn> = {}): EnrichedTxn => ({
  id,
  accountId: "chk",
  postedAt,
  amountCents,
  description: `${name.toUpperCase()} *1234`,
  type: amountCents < 0 ? "card" : "ach_credit",
  status: "posted",
  vendor: { key: name.toLowerCase(), name, category, job: null, source: "catalog" },
  ...extra,
} as EnrichedTxn);

const txns = [
  txn("t1", "2026-09-03", -14_990, "Zoom", "software"),
  txn("t2", "2026-10-03", -14_990, "Zoom", "software"),
  txn("t3", "2026-10-05", -900_000_00, "Gusto", "payroll"),
  txn("t4", "2026-10-07", 25_000_00, "Stripe", "revenue"),
  txn("t5", "2026-10-07", -8_250, "Uber", "travel", { cardholder: "Maya Chen" }),
];

describe("transaction search", () => {
  it("lists everything newest first, with money in and out totalled in cents", () => {
    const r = searchTransactions(txns, parseTxnQuery({}));
    expect(r.rows.map((t) => t.id)).toEqual(["t4", "t5", "t3", "t2", "t1"]);
    expect(r.total).toBe(5);
    expect(r.outCents).toBe(14_990 * 2 + 900_000_00 + 8_250);
    expect(r.inCents).toBe(25_000_00);
    expect(r.months).toEqual(["2026-10", "2026-09"]);
  });

  it("matches words in the vendor, the bank's description or the cardholder, ignoring case", () => {
    expect(searchTransactions(txns, parseTxnQuery({ q: "zoom" })).rows.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(searchTransactions(txns, parseTxnQuery({ q: "*1234" })).total).toBe(5);
    expect(searchTransactions(txns, parseTxnQuery({ q: "maya" })).rows.map((t) => t.id)).toEqual(["t5"]);
    // Every word has to match somewhere.
    expect(searchTransactions(txns, parseTxnQuery({ q: "zoom maya" })).total).toBe(0);
  });

  it("filters by category, month and direction together", () => {
    expect(searchTransactions(txns, parseTxnQuery({ category: "software", month: "2026-10" })).rows.map((t) => t.id)).toEqual(["t2"]);
    expect(searchTransactions(txns, parseTxnQuery({ direction: "in" })).rows.map((t) => t.id)).toEqual(["t4"]);
    const out = searchTransactions(txns, parseTxnQuery({ direction: "out", month: "2026-10" }));
    expect(out.rows.map((t) => t.id)).toEqual(["t5", "t3", "t2"]);
    expect(out.inCents).toBe(0);
  });

  it("pages through long lists and keeps totals for the whole match", () => {
    const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => txn(`m${String(i).padStart(3, "0")}`, "2026-10-01", -100, "Zoom", "software"));
    const p1 = searchTransactions(many, parseTxnQuery({}));
    expect(p1.rows).toHaveLength(PAGE_SIZE);
    expect(p1.pages).toBe(3);
    expect(p1.outCents).toBe(100 * many.length);
    const p3 = searchTransactions(many, parseTxnQuery({ page: "3" }));
    expect(p3.rows).toHaveLength(3);
    expect(p3.page).toBe(3);
    // A page past the end shows the last one rather than nothing.
    expect(searchTransactions(many, parseTxnQuery({ page: "99" })).page).toBe(3);
    // Same-day rows keep a stable order across pages.
    const ids = [1, 2, 3].flatMap((page) => searchTransactions(many, parseTxnQuery({ page: String(page) })).rows.map((t) => t.id));
    expect(new Set(ids).size).toBe(many.length);
  });

  it("ignores anything it doesn't understand in the address instead of failing", () => {
    const q = parseTxnQuery({ q: "x".repeat(500), category: "snacks", month: "2026-13", direction: "sideways", page: "-4" });
    expect(q).toEqual({ q: "x".repeat(100), category: null, month: null, direction: "all", vendor: null, account: null, page: 1 });
    expect(parseTxnQuery({ vendor: "Zoom; drop" }).vendor).toBeNull();
    expect(parseTxnQuery({ q: ["zoom", "uber"], page: "2.5" })).toMatchObject({ q: "zoom", page: 1 });
    expect(searchTransactions([], parseTxnQuery({}))).toMatchObject({ rows: [], total: 0, pages: 1, page: 1, outCents: 0, inCents: 0, uncounted: 0, months: [] });
  });

  it("narrows to one vendor exactly, by its key, from a dashboard link", () => {
    const withLookalike = [...txns, txn("t6", "2026-10-09", -500, "Zoomies Pet Care", "other")];
    // A word search for "zoom" also finds the lookalike; the vendor filter doesn't.
    expect(searchTransactions(withLookalike, parseTxnQuery({ q: "zoom" })).total).toBe(3);
    const r = searchTransactions(withLookalike, parseTxnQuery({ vendor: "zoom" }));
    expect(r.rows.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(r.vendorName).toBe("Zoom");
    expect(searchTransactions(withLookalike, parseTxnQuery({ vendor: "nobody" })).vendorName).toBeNull();
  });

  it("totals spending like the dashboard: transfers between accounts and pending rows are listed but not counted", () => {
    const withMoves = [
      ...txns,
      txn("x1", "2026-10-08", -50_000_00, "Savings", "transfer", { type: "transfer" }),
      txn("x2", "2026-10-08", 50_000_00, "Savings", "transfer", { type: "transfer" }),
      txn("p1", "2026-10-09", -1_000, "Zoom", "software", { status: "pending" }),
    ];
    const all = searchTransactions(withMoves, parseTxnQuery({}));
    expect(all.total).toBe(8);
    expect(all.outCents).toBe(14_990 * 2 + 900_000_00 + 8_250);
    expect(all.inCents).toBe(25_000_00);
    expect(all.uncounted).toBe(3);
    // Asking for transfers on purpose totals them.
    const moves = searchTransactions(withMoves, parseTxnQuery({ category: "transfer" }));
    expect(moves).toMatchObject({ total: 2, outCents: 50_000_00, inCents: 50_000_00, uncounted: 0 });
  });

  it("gives every match, unpaged, for a download", async () => {
    const { matchingTransactions } = await import("@/lib/finance/transaction-search");
    const many = Array.from({ length: PAGE_SIZE + 7 }, (_, i) => txn(`d${String(i).padStart(3, "0")}`, "2026-10-01", -100, "Zoom", "software"));
    expect(matchingTransactions(many, parseTxnQuery({ page: "2" }))).toHaveLength(PAGE_SIZE + 7);
    expect(matchingTransactions(txns, parseTxnQuery({ q: "zoom" })).map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("ranks where the matched money went by vendor, counting spend the dashboard way", () => {
    const r = searchTransactions(
      [...txns, txn("t7", "2026-10-11", -20_000, "Zoom", "software"), txn("x", "2026-10-12", -99_999_00, "Savings", "transfer", { type: "transfer" })],
      parseTxnQuery({ direction: "out" }),
    );
    expect(r.topVendors).toEqual([
      { key: "gusto", name: "Gusto", outCents: 900_000_00 },
      { key: "zoom", name: "Zoom", outCents: 14_990 * 2 + 20_000 },
      { key: "uber", name: "Uber", outCents: 8_250 },
    ]);
    // Narrowed to one vendor already, there's nothing to rank.
    expect(searchTransactions(txns, parseTxnQuery({ vendor: "zoom" })).topVendors).toEqual([]);
  });
});

describe("transactions by account", () => {
  const mixed = [...txns.slice(0, 4), txn("c1", "2026-10-08", -12_00, "OpenAI", "ai_api", { accountId: "amex …1009 card" }), txn("c2", "2026-10-09", -3_00, "Figma", "software", { accountId: "amex …1009 card" })];

  it("narrows to one account, and lists the accounts there are to pick from", () => {
    const r = searchTransactions(mixed, parseTxnQuery({ account: "amex …1009 card" }));
    expect(r.rows.map((t) => t.id)).toEqual(["c2", "c1"]);
    expect(r.outCents).toBe(15_00);
    expect(r.accounts).toEqual(["amex …1009 card", "chk"]);
    // Every other filter still applies on top.
    expect(searchTransactions(mixed, parseTxnQuery({ account: "amex …1009 card", category: "software" })).rows.map((t) => t.id)).toEqual(["c2"]);
  });

  it("reads the account from the address safely", () => {
    expect(parseTxnQuery({ account: "  chk  " }).account).toBe("chk");
    expect(parseTxnQuery({ account: "" }).account).toBeNull();
    expect(parseTxnQuery({ account: "x".repeat(200) }).account).toHaveLength(80);
    // An account that isn't there matches nothing, rather than everything.
    expect(searchTransactions(mixed, parseTxnQuery({ account: "gone" })).total).toBe(0);
  });
});

describe("searching names however they're typed", () => {
  it("finds a cardholder across case, spacing and invisible characters", () => {
    const rows = [
      txn("x1", "2026-10-01", -1_00, "Figma", "software", { cardholder: "Maya Chen" }),
      txn("x2", "2026-10-02", -1_00, "Loom", "software", { cardholder: "Ma​ya  Chen" }),
      txn("x3", "2026-10-03", -1_00, "Zoom", "software", { cardholder: "Sam Lee" }),
    ];
    expect(searchTransactions(rows, parseTxnQuery({ q: "maya chen" })).rows.map((t) => t.id).sort()).toEqual(["x1", "x2"]);
  });
});
