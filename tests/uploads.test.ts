import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importCsv } from "@/lib/csv/import";
import { analyze } from "@/lib/pipeline";
import { CASH_ACCOUNT_ID, toUploadRows, uploadChunk, uploadedDataset } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

const csv = (lines: string[]) => ["Date,Description,Amount", ...lines].join("\n");
const parse = (text: string) => importCsv(text, { accountId: "uploaded", resolvePayoffs: false }).transactions;

describe("upload rows", () => {
  it("number identical rows within a file so a real double charge survives", () => {
    const rows = toUploadRows(parse(csv(["2026-08-10,CANVA,-119.99", "2026-08-10,CANVA,-119.99", "2026-08-11,ZOOM,-149.90"])));
    expect(rows.map((r) => r.n)).toEqual([0, 1, 0]);
    expect(new Set(storedRowsFrom(rows).map((r) => r.id)).size).toBe(3);
  });

  it("give the same row the same id in an overlapping export, so re-uploading doesn't duplicate", () => {
    const july = storedRowsFrom(toUploadRows(parse(csv(["2026-07-31,ACME,-10.00", "2026-08-01,ZOOM,-149.90"]))));
    const august = storedRowsFrom(toUploadRows(parse(csv(["2026-08-01,ZOOM,-149.90", "2026-08-02,FIGMA,-45.00"]))));
    const overlap = july.filter((r) => august.some((a) => a.id === r.id));
    expect(overlap).toHaveLength(1);
    expect(overlap[0]!.counterparty_name).toBe("ZOOM");
  });

  it("validates every row on the server and refuses anything malformed", () => {
    const good = { date: "2026-08-01", description: "ZOOM", amountCents: -14990, type: "ach_debit", account: "uploaded", accountType: "checking", cardholder: null, n: 0 };
    expect(uploadChunk.safeParse({ cashCents: 100_000_00, rows: [good] }).success).toBe(true);
    for (const bad of [
      { ...good, date: "2026-13-01" },
      { ...good, amountCents: 1.5 },
      { ...good, description: "" },
      { ...good, description: "x".repeat(300) },
      { ...good, type: "DROP TABLE" },
      { ...good, accountType: "rewards" },
      { ...good, n: -1 },
    ]) expect(uploadChunk.safeParse({ cashCents: 1, rows: [bad] }).success, JSON.stringify(bad)).toBe(false);
    expect(uploadChunk.safeParse({ cashCents: -1, rows: [good] }).success).toBe(false);
    expect(uploadChunk.safeParse({ cashCents: 1, rows: Array(5_001).fill(good) }).success).toBe(false);
  });

  it("builds a dataset the engine can analyse, with today's cash on its own account", () => {
    const stored = storedRowsFrom(toUploadRows(parse(csv(["2026-06-05,DATADOG INC,-2400.00", "2026-07-05,DATADOG INC,-2400.00", "2026-08-05,DATADOG INC,-3600.00", "2026-08-20,STRIPE TRANSFER,5000.00"]))));
    const data = uploadedDataset({ cashCents: 50_000_000, rows: stored });
    expect(data.accounts.find((a) => a.id === CASH_ACCOUNT_ID)!.balance.amount).toBe(50_000_000);
    const a = analyze({ accounts: data.accounts, transactions: data.transactions });
    expect(a.snapshot.cashCents).toBe(50_000_000);
    expect(a.txns).toHaveLength(4);
  });

  it("counts a card payoff as spend unless the card's own rows were uploaded too (decided over everything stored)", () => {
    const checking = storedRowsFrom(toUploadRows(parse(csv(["2026-08-28,CARD PAYMENT,-1000.00"]))));
    const alone = uploadedDataset({ cashCents: 1, rows: checking });
    expect(alone.transactions[0]!.transaction_type).toBe("unitemized_card_spend");
    // The card account's export shows the payoff arriving: the incoming leg.
    const cardLeg = storedRowsFrom(toUploadRows(parse(csv(["2026-08-28,CARD PAYMENT,1000.00"]))));
    const both = uploadedDataset({ cashCents: 1, rows: [...checking, ...cardLeg] });
    expect(both.transactions.every((t) => t.transaction_type === "credit_repayment")).toBe(true);
  });
});

describe("row ids", () => {
  it("keep the sign, so ids stored before stay the same and nothing already stored is duplicated", () => {
    const csv = (amount: string) => ["Date,Description,Amount", `2026-10-02,LINEAR,${amount}`].join("\n");
    const pos = storedRowsFrom(toUploadRows(parse(csv("96.00"))));
    const neg = storedRowsFrom(toUploadRows(parse(csv("-96.00"))));
    expect(neg[0]!.id).not.toBe(pos[0]!.id);
    // Pinned: the id scheme rows were first stored with.
    expect(neg[0]!.id).toBe("u_" + createHash("sha256").update(JSON.stringify(["2026-10-02", "LINEAR", -9600, "uploaded", 0])).digest("hex").slice(0, 32));
  });

  it("keep a same-day charge and refund apart", () => {
    const rows = storedRowsFrom(toUploadRows(parse(["Date,Description,Amount", "2026-10-02,AMAZON,-50.00", "2026-10-02,AMAZON,50.00"].join("\n"))));
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe("long text cut to size", () => {
  it("never cuts an emoji in half (Postgres refuses half a character)", () => {
    const long = `${"x".repeat(199)}🚀 and more`;
    const [row] = toUploadRows(importCsv(`Date,Description,Amount\n2026-10-01,${long},-5.00\n`, { accountId: `${"a".repeat(79)}🏦`, resolvePayoffs: false }).transactions);
    expect(row!.description).toBe("x".repeat(199));
    expect(row!.account).toBe("a".repeat(79));
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const s of [row!.description, row!.account]) expect(s).not.toMatch(lone);
    // A whole emoji that fits is kept.
    const [kept] = toUploadRows(importCsv(`Date,Description,Amount\n2026-10-01,${"x".repeat(198)}🚀,-5.00\n`, { accountId: "a", resolvePayoffs: false }).transactions);
    expect(kept!.description).toBe(`${"x".repeat(198)}🚀`);
    expect(uploadChunk.safeParse({ rows: [row, kept] }).success).toBe(true);
  });
});
