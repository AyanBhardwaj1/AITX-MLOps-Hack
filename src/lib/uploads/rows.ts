import { z } from "zod";
import { resolveCardPayoffs } from "../csv/import";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import type { Cents } from "../types";
import { MAX_CASH_CENTS } from "../money";

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
  /**
   * Today's total cash across bank accounts (a CSV has no balance). Left out when the founder
   * didn't change it, so a page opened earlier can't put back a figure a teammate has since updated.
   */
  cashCents: z.number().int().min(0).max(MAX_CASH_CENTS).optional(),
  rows: z.array(uploadRow).min(1).max(MAX_CHUNK_ROWS),
});
export type UploadChunk = z.infer<typeof uploadChunk>;

/** The account name a file gets when its name says nothing about the account. */
export const DEFAULT_ACCOUNT_LABEL = "uploaded";
const DEFAULT_ACCOUNT = DEFAULT_ACCOUNT_LABEL;
/** Words in export file names that say nothing about which account it is. */
const NOISE = new Set(["export", "exports", "statement", "statements", "transactions", "transaction", "activity", "history", "download", "csv", "copy", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december"]);

/**
 * The account a file without an Account column belongs to, guessed from its name and editable by
 * the founder. It's part of each row's identity, so the same charge on two cards is kept twice
 * while an overlapping export of the same account is recognised.
 */
export function fileAccountLabel(fileName: string): string {
  const words = fileName
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/\d/.test(w) && !NOISE.has(w));
  return words.join(" ").slice(0, 40).trim() || DEFAULT_ACCOUNT;
}

/**
 * Trimmed and cut to `max` UTF-16 units (what the server's limit counts), never between the two
 * halves of an emoji: half a character is invalid text, and Postgres refuses the whole row.
 */
function clean(s: string, max: number): string {
  let cut = s.trim().slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return cut.trim();
}

/** One file's imported transactions as upload rows, numbering identical rows so real duplicates survive. */
export function toUploadRows(txns: readonly RhoTransaction[]): UploadRow[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const date = (t.posted_at ?? t.initiated_at).slice(0, 10);
    // Number copies on exactly what's stored (and hashed), so formatting differences don't change identity.
    const description = clean(t.counterparty_name, 200);
    const account = clean(t.account_id, 80) || DEFAULT_ACCOUNT;
    const key = `${date}|${description}|${t.amount.amount}|${account}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const cardholder = clean(t.user_full_name ?? "", 80);
    return {
      date,
      description,
      amountCents: t.amount.amount,
      type: t.transaction_type,
      account,
      accountType: t.account_type === "credit" ? "credit" : "checking",
      cardholder: cardholder || null,
      n,
    };
  });
}

/**
 * Everything a company uploaded, ready for the engine: one cash account holding the balance they
 * entered, an empty account per uploaded account, and card payoffs resolved over all rows together.
 */
export function uploadedDataset({ cashCents, rows: all, today }: { cashCents: Cents; rows: readonly RhoTransaction[]; today?: string }): { accounts: RhoAccount[]; transactions: RhoTransaction[] } {
  // A row dated after today (a scheduled payment in the export) hasn't happened: counted, it would
  // move "as of" into the future and quiet the alerts (a rent payment due on the 1st, uploaded on
  // the 31st, would turn the month). Today is UTC, which is already tomorrow for US evenings.
  const rows = today ? all.filter((r) => (r.posted_at ?? r.initiated_at).slice(0, 10) <= today) : all;
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
