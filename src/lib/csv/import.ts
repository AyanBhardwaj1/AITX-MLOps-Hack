import { UNITEMIZED_CARD_SPEND } from "../rho/map";
import type { RhoTransaction } from "../rho/schema";
import { resolveVendor } from "../vendors/normalize";

/**
 * Bank-export CSV → Rho-shaped transactions, so a file from any bank runs through the same
 * deterministic pipeline as the live feed. Pure: no network, no storage; safe to run in the browser.
 *
 * Layouts:
 * - "rho": Date, Description, Amount, Type, Account, Cardholder (our own export shape)
 * - "mercury": Date (UTC), Description, Amount, Status, Source Account, Name On Card [columns UNVERIFIED
 *   against Mercury's docs, which were unreachable from the build sandbox]
 * - "generic": date, description, amount (one account, no types, no cardholder)
 */

export type CsvLayout = "rho" | "mercury" | "generic";

export interface CsvImport {
  layout: CsvLayout;
  transactions: RhoTransaction[];
  /**
   * True when card payoffs from checking were counted as spend because the card's own rows
   * weren't in the upload (the payoff is then the only trace of that card spend).
   */
  cardSpendAsPayoffs: boolean;
  /** Line numbers in the file (header = line 1) that couldn't be read, as a spreadsheet shows them. */
  skipped: number[];
}

/** Paying off the company's own card. A transfer only when the card's rows are also uploaded. */
const CARD_PAYOFF_PATTERN = /\b(CARD PAYMENT|AUTOPAY|E-?PAYMENT|PAYMENT THANK YOU|ONLINE PAYMENT)\b/i;
/** Moving money between the company's own accounts: never burn. */
const INTERNAL_TRANSFER_PATTERN = /\b(TRANSFER (TO|FROM)|INTERNAL TRANSFER|SWEEP|BOOK TRANSFER)\b/i;
/** Payouts from revenue processors often say "TRANSFER" too; they are revenue, not internal moves. */
const isRevenuePayout = (description: string) => resolveVendor(description).category === "revenue";

/** RFC 4180-style parsing: quoted fields, embedded commas and newlines, doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseAmountCents(raw: string): number | null {
  const s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const digits = s.replace(/[()$,\s+-]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return null;
  const cents = Math.round(Number(digits) * 100);
  return negative ? -cents : cents;
}

/** YYYY-MM-DD (optionally with a time) or US MM/DD/YYYY or MM-DD-YYYY. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const norm = (h: string) => h.trim().toLowerCase();

export function detectLayout(headers: readonly string[]): CsvLayout | null {
  const h = new Set(headers.map(norm));
  if (h.has("date (utc)") && h.has("amount") && h.has("description")) return "mercury";
  if (h.has("date") && h.has("description") && h.has("amount")) return h.has("type") && h.has("cardholder") ? "rho" : "generic";
  return null;
}

function rowToTransaction(get: (col: string) => string, layout: CsvLayout, accountId: string, rowNo: number): RhoTransaction | null {
  const date = parseDate(get(layout === "mercury" ? "date (utc)" : "date"));
  const amount = parseAmountCents(get("amount"));
  const description = get("description").trim();
  if (!date || amount === null || !description) return null;
  const cardholder = (layout === "rho" ? get("cardholder") : layout === "mercury" ? get("name on card") : "").trim() || null;
  const explicitType = layout === "rho" ? get("type").trim() : "";
  const inferred =
    !isRevenuePayout(description) && INTERNAL_TRANSFER_PATTERN.test(description)
      ? "internal_transfer"
      : CARD_PAYOFF_PATTERN.test(description)
        ? "credit_repayment"
        : cardholder
          ? amount < 0
            ? "card_debit"
            : "card_credit"
          : amount < 0
            ? "ach_debit"
            : "ach_credit";
  const type = explicitType || inferred;
  const account = (layout === "rho" ? get("account") : layout === "mercury" ? get("source account") : "").trim() || accountId;
  const first = cardholder?.split(" ")[0];
  return {
    id: `csv_${account}_${rowNo}`,
    money_movement_id: null,
    account_id: account,
    account_name: account,
    account_type: cardholder ? "credit" : "checking",
    amount: { amount, currency: "USD" },
    status: "settled",
    transaction_type: type,
    counterparty_name: description,
    initiated_at: `${date}T12:00:00Z`,
    posted_at: `${date}T12:00:00Z`,
    card_id: first ? `card_${first.toLowerCase()}` : null,
    card_name: first ? `${first}'s card` : null,
    user_full_name: cardholder,
  };
}

/** Parses one exported file. Throws when the columns aren't recognised; skips (and reports) unreadable rows. */
export function importCsv(text: string, { accountId }: { accountId: string }): CsvImport {
  const [header, ...rows] = parseCsv(text);
  const layout = header ? detectLayout(header) : null;
  if (!header || !layout) throw new Error("Unrecognised columns: expected at least Date, Description and Amount");
  const index = new Map(header.map((h, i) => [norm(h), i]));
  const transactions: RhoTransaction[] = [];
  const skipped: number[] = [];
  rows.forEach((cells, i) => {
    const get = (col: string) => cells[index.get(col) ?? -1] ?? "";
    const line = i + 2;
    const t = rowToTransaction(get, layout, accountId, line);
    if (t) transactions.push(t);
    else skipped.push(line);
  });
  // A payoff with no matching incoming leg means the card account wasn't uploaded: its spend only
  // shows up as these lumps, so count them as spend instead of dropping them as transfers.
  const payoffs = transactions.filter((t) => t.transaction_type === "credit_repayment");
  const cardSpendAsPayoffs = layout !== "rho" && payoffs.length > 0 && !payoffs.some((t) => t.amount.amount > 0);
  const out = cardSpendAsPayoffs
    ? transactions.map((t) => (t.transaction_type === "credit_repayment" ? { ...t, transaction_type: UNITEMIZED_CARD_SPEND } : t))
    : transactions;
  return { layout, transactions: out, skipped, cardSpendAsPayoffs };
}
