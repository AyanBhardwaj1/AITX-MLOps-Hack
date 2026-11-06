import { describe, expect, it } from "vitest";
import { uploadedDataset } from "@/lib/uploads/rows";
import type { RhoTransaction } from "@/lib/rho/schema";

const row = (id: string, date: string, amount: number): RhoTransaction =>
  ({
    id,
    money_movement_id: null,
    account_id: "uploaded",
    account_name: "uploaded",
    account_type: "checking",
    amount: { amount, currency: "USD" },
    status: "settled",
    transaction_type: "ach_debit",
    counterparty_name: id,
    initiated_at: `${date}T12:00:00Z`,
    posted_at: `${date}T12:00:00Z`,
    card_id: null,
    card_name: null,
    user_full_name: null,
  }) as RhoTransaction;

describe("rows dated after today", () => {
  it("are left out of the company's data (a scheduled payment hasn't happened), even tomorrow's", () => {
    const d = uploadedDataset({ cashCents: 1, rows: [row("past", "2026-11-05", -100), row("today", "2026-11-06", -100), row("rent on the 1st", "2026-11-07", -100), row("scheduled", "2026-12-15", -1_000)], today: "2026-11-06" });
    expect(d.transactions.map((t) => t.id)).toEqual(["past", "today"]);
    expect(d.futureRows).toBe(2);
  });
});

describe("the grader and future-dated rows", () => {
  it("leaves rows dated after today out, says so, and doesn't call the other export behind", async () => {
    const { gradeCsvFiles } = await import("@/lib/grader");
    // The grader runs in the browser and uses the visitor's own date.
    const { localIsoDate } = await import("@/lib/dates");
    const today = localIsoDate();
    const later = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const g = gradeCsvFiles([{ name: "a.csv", text: `Date,Description,Amount\n${today},FIGMA,-15.00\n${later},SCHEDULED ACH,-1000.00` }], 100_000_00);
    expect(g.transactions).toBe(1);
    expect(g.asOf).toBe(today);
    expect(g.notes.join(" ")).toMatch(/1 row dated after today/);
  });
});

describe("the grader's lagging-export note ignores rows left out", () => {
  it("a scheduled row in one file doesn't make the other look behind", async () => {
    const { gradeCsvFiles } = await import("@/lib/grader");
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const rows = [-60, -45, -30, -15, 0].map((n, i) => `${day(n)},VENDOR ${i},-10.00`);
    const g = gradeCsvFiles(
      [
        { name: "card.csv", text: `Date,Description,Amount\n${rows.join("\n")}` },
        { name: "checking.csv", text: `Date,Description,Amount\n${rows.map((r) => r.replace("VENDOR", "SHOP")).join("\n")}\n${day(40)},SCHEDULED ACH,-1000.00` },
      ],
      100_000_00,
    );
    expect(g.notes.join(" ")).not.toMatch(/days before the newest one/);
  });
});

describe("upload rows that Postgres would refuse", () => {
  it("strips NUL and mends lone surrogates; the server schema does too", async () => {
    const { toUploadRows, uploadRow } = await import("@/lib/uploads/rows");
    const [r] = toUploadRows([{ ...row("x", "2026-11-01", -100), counterparty_name: "ZO\u0000OM\uD800 PRO", account_id: "chk\u0000" }]);
    expect(r!.description).toBe("ZOOM� PRO");
    expect(r!.account).toBe("chk");
    const parsed = uploadRow.parse({ ...r!, description: "A\u0000B\uDC00" });
    expect(parsed.description).toBe("AB�");
  });

  it("an account can't be named like the entered-cash account", async () => {
    const { toUploadRows, uploadRow, CASH_ACCOUNT_ID } = await import("@/lib/uploads/rows");
    const [r] = toUploadRows([{ ...row("x", "2026-11-01", -100), account_id: CASH_ACCOUNT_ID }]);
    expect(r!.account).not.toBe(CASH_ACCOUNT_ID);
    expect(uploadRow.safeParse({ ...r!, account: CASH_ACCOUNT_ID }).success).toBe(false);
  });

  it("chunks stay under the request size even with long non-Latin text", async () => {
    const { chunkUploadRows, toUploadRows, MAX_CHUNK_BYTES } = await import("@/lib/uploads/rows");
    const rows = toUploadRows(Array.from({ length: 6_000 }, (_, i) => ({ ...row(`t${i}`, "2026-11-01", -100 - i), counterparty_name: "支".repeat(196), account_id: "账户".repeat(20) })));
    const chunks = chunkUploadRows(rows);
    expect(chunks.flat()).toHaveLength(6_000);
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify({ cashCents: 0, rows: c })).length).toBeLessThan(MAX_CHUNK_BYTES);
  });
});

describe("the matches export reads repeated parameters as the page does", () => {
  it("takes the first value, like parseTxnQuery on the page", async () => {
    const { parseTxnQuery } = await import("@/lib/finance/transaction-search");
    const params = new URLSearchParams("category=software&category=payroll&month=2026-08&month=2026-09");
    const all = Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)]));
    expect(parseTxnQuery(all)).toMatchObject({ category: "software", month: "2026-08" });
  });
});

describe("storable text keeps what Postgres stores", () => {
  it("only NUL and half an emoji change, so rows stored before keep their identity; an emptied description gets a placeholder", async () => {
    const { toUploadRows, storableText } = await import("@/lib/uploads/rows");
    expect(storableText("ACME\u0001 CORP\u007F")).toBe("ACME\u0001 CORP\u007F");
    const [r] = toUploadRows([{ ...row("x", "2026-11-01", -100), counterparty_name: "\u0000\u0000" }]);
    expect(r!.description).toBe("(no description)");
  });
});
