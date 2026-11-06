import { z } from "zod";
import { resolveCardPayoffs } from "../csv/import";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import type { Cents } from "../types";

/**
 * Bank exports uploaded into a company. The browser parses files with the grader's importer and
 * sends compact rows in chunks; the server validates each one again. Browser-safe.
 */

export const MAX_CHUNK_ROWS = 5_000;
/** Enough for years of a startup's transactions; keeps one company's storage bounded. */
export const MAX_ROWS_PER_COMPANY = 100_000;
export const CASH_ACCOUNT_ID = "cash_entered";
const MAX_ABS_CENTS = 1e12;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "invalid date");

export const uploadRow = z.object({
  date: isoDate,
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().refine((n) => Math.abs(n) <= MAX_ABS_CENTS, "amount out of range"),
  type: z.string().regex(/^[a-z_]{1,40}$/),
  account: z.string().trim().min(1).max(80),
  accountType: z.enum(["checking", "credit"]),
  cardholder: z.string().trim().min(1).max(80).nullable(),
  /** Which copy of an identical row (same day, description, amount, account) this is within its file. */
  n: z.number().int().min(0).max(10_000),
});
export type UploadRow = z.infer<typeof uploadRow>;

export const uploadChunk = z.object({
  /** Today's total cash across bank accounts (a CSV has no balance). */
  cashCents: z.number().int().min(0).max(1e13),
  rows: z.array(uploadRow).min(1).max(MAX_CHUNK_ROWS),
});
export type UploadChunk = z.infer<typeof uploadChunk>;

/** One file's imported transactions as upload rows, numbering identical rows so real duplicates survive. */
export function toUploadRows(txns: readonly RhoTransaction[]): UploadRow[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const date = (t.posted_at ?? t.initiated_at).slice(0, 10);
    const key = `${date}|${t.counterparty_name}|${t.amount.amount}|${t.account_id}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return {
      date,
      description: t.counterparty_name.slice(0, 200),
      amountCents: t.amount.amount,
      type: t.transaction_type,
      account: t.account_id.slice(0, 80),
      accountType: t.account_type === "credit" ? "credit" : "checking",
      cardholder: t.user_full_name ?? null,
      n,
    };
  });
}

/**
 * Everything a company uploaded, ready for the engine: one cash account holding the balance they
 * entered, an empty account per uploaded account, and card payoffs resolved over all rows together.
 */
export function uploadedDataset({ cashCents, rows }: { cashCents: Cents; rows: readonly RhoTransaction[] }): { accounts: RhoAccount[]; transactions: RhoTransaction[] } {
  const accountTypes = new Map<string, RhoAccount["account_type"]>();
  for (const r of rows) {
    // An account with any non-card row holds cash (a debit card on checking is still checking).
    if (r.account_type !== "credit") accountTypes.set(r.account_id, "checking");
    else if (!accountTypes.has(r.account_id)) accountTypes.set(r.account_id, "credit");
  }
  const accounts: RhoAccount[] = [
    { id: CASH_ACCOUNT_ID, account_type: "checking", account_name: "Cash (entered at upload)", balance: { amount: cashCents, currency: "USD" } },
    ...[...accountTypes].filter(([id]) => id !== CASH_ACCOUNT_ID).map(([id, type]) => ({ id, account_type: type, account_name: id, balance: { amount: 0, currency: "USD" } })),
  ];
  return { accounts, transactions: resolveCardPayoffs(rows).transactions };
}
