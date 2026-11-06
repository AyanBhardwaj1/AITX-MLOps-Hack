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
    const today = new Date().toISOString().slice(0, 10);
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
