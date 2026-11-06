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

export type CsvLayout = "rho" | "mercury" | "generic" | "headerless";

export interface CsvImport {
  layout: CsvLayout;
  transactions: RhoTransaction[];
  /**
   * True when card payoffs from checking were counted as spend because the card's own rows
   * weren't in the upload (the payoff is then the only trace of that card spend).
   */
  cardSpendAsPayoffs: boolean;
  /**
   * More than MOSTLY_POSITIVE_SHARE of the amounts are positive: the export may list charges as
   * positive numbers (some card exports do), which would hide spend.
   */
  mostlyPositive: boolean;
  /** Line numbers in the file (header = line 1) that couldn't be read, as a spreadsheet shows them. */
  skipped: number[];
}

/** Paying off the company's own card. A transfer only when the card's rows are also uploaded. */
const CARD_PAYOFF_PATTERN = /\b(CARD PAYMENT|AUTOPAY|E-?PAYMENT|PAYMENT THANK YOU|ONLINE PAYMENT)\b/i;
/** Moving money between the company's own accounts: never burn. */
const INTERNAL_TRANSFER_PATTERN = /\b(TRANSFER (TO|FROM)|INTERNAL TRANSFER|SWEEP|BOOK TRANSFER)\b/i;
/** Mercury statuses for money that never moved. */
const NOT_COMPLETED = /^(failed|cancel+ed|canceled|declined|reversed)$/i;
const MOSTLY_POSITIVE_SHARE = 0.7;

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

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");

/** Header names banks use for each field, most specific first. Posting date wins: it's when cash moved. */
const ALIASES = {
  date: ["date", "posting date", "post date", "posted date", "date posted", "transaction date", "trans date", "trans. date"],
  description: ["description", "payee", "merchant", "merchant name", "name", "counterparty", "transaction description", "memo"],
  amount: ["amount", "amount (usd)", "transaction amount"],
  debit: ["debit", "debits", "debit amount", "withdrawal", "withdrawals", "withdrawal amount", "money out", "paid out"],
  credit: ["credit", "credits", "credit amount", "deposit", "deposits", "deposit amount", "money in", "paid in"],
  cardholder: ["cardholder", "card member", "name on card", "cardholder name", "card holder"],
} as const;
/** Card exports whose charges are positive numbers (spending must come out negative). */
const POSITIVE_CHARGE_HEADERS = new Set(["card member"]);
const HEADER_SEARCH_ROWS = 20;
const HEADERLESS_MIN_SHARE = 0.9;

/** Where each field is in a file's rows. */
interface Mapping {
  layout: CsvLayout;
  /** Index of the header row; -1 when the file has none. */
  headerRow: number;
  date: number;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  cardholder: number | null;
  account: number | null;
  type: number | null;
  status: number | null;
  /** Charges are listed as positive numbers. */
  invert: boolean;
}

function mappingFromHeader(headers: readonly string[], headerRow: number): Mapping | null {
  const cols = headers.map(norm);
  const find = (names: readonly string[]) => {
    for (const n of names) {
      const i = cols.indexOf(n);
      if (i >= 0) return i;
    }
    return null;
  };
  const has = (n: string) => cols.includes(n);
  if (has("date (utc)") && has("amount") && has("description")) {
    return { layout: "mercury", headerRow, date: cols.indexOf("date (utc)"), description: cols.indexOf("description"), amount: cols.indexOf("amount"), debit: null, credit: null, cardholder: find(["name on card"]), account: find(["source account"]), type: null, status: find(["status"]), invert: false };
  }
  const date = find(ALIASES.date);
  const description = find(ALIASES.description);
  const amount = find(ALIASES.amount);
  const debit = find(ALIASES.debit);
  const credit = find(ALIASES.credit);
  if (date === null || description === null || (amount === null && (debit === null || credit === null))) return null;
  const rho = has("date") && has("description") && has("amount") && has("type") && has("cardholder");
  return {
    layout: rho ? "rho" : "generic",
    headerRow,
    date,
    description,
    amount,
    debit: amount === null ? debit : null,
    credit: amount === null ? credit : null,
    cardholder: find(ALIASES.cardholder),
    account: rho ? cols.indexOf("account") : null,
    type: rho ? cols.indexOf("type") : null,
    status: null,
    invert: cols.some((c) => POSITIVE_CHARGE_HEADERS.has(c)),
  };
}

/** A file without a header row: the date column, the first amount column, and the wordiest text column. */
function headerlessMapping(rows: readonly string[][]): Mapping | null {
  const sample = rows.slice(0, 200);
  if (sample.length === 0) return null;
  const width = Math.max(...sample.map((r) => r.length));
  const share = (col: number, ok: (v: string) => boolean) => sample.filter((r) => ok(r[col] ?? "")).length / sample.length;
  const cols = [...Array(width).keys()];
  const date = cols.find((c) => share(c, (v) => parseDate(v) !== null) >= HEADERLESS_MIN_SHARE);
  if (date === undefined) return null;
  const amount = cols.find((c) => c !== date && share(c, (v) => parseAmountCents(v) !== null && /\d\.\d{2}\)?$/.test(v.trim())) >= HEADERLESS_MIN_SHARE);
  if (amount === undefined) return null;
  const wordiness = (c: number) => sample.reduce((n, r) => n + ((r[c] ?? "").match(/[A-Za-z]/g)?.length ?? 0), 0);
  const description = cols.filter((c) => c !== date && c !== amount).sort((a, b) => wordiness(b) - wordiness(a))[0];
  if (description === undefined || wordiness(description) === 0) return null;
  return { layout: "headerless", headerRow: -1, date, description, amount, debit: null, credit: null, cardholder: null, account: null, type: null, status: null, invert: false };
}

function findMapping(rows: readonly string[][]): Mapping | null {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const m = mappingFromHeader(rows[i]!, i);
    if (m) return m;
  }
  return headerlessMapping(rows);
}

export function detectLayout(headers: readonly string[]): CsvLayout | null {
  return mappingFromHeader(headers, 0)?.layout ?? null;
}

function rowAmount(cells: readonly string[], m: Mapping): number | null {
  if (m.amount !== null) return parseAmountCents(cells[m.amount] ?? "");
  const debit = (cells[m.debit!] ?? "").trim();
  const credit = (cells[m.credit!] ?? "").trim();
  const out = debit ? parseAmountCents(debit) : 0;
  const into = credit ? parseAmountCents(credit) : 0;
  if (out === null || into === null || (!debit && !credit)) return null;
  return Math.abs(into) - Math.abs(out);
}

function rowToTransaction(cells: readonly string[], m: Mapping, accountId: string, rowNo: number, flipSigns: boolean): RhoTransaction | "not_completed" | null {
  const get = (col: number | null) => (col === null ? "" : (cells[col] ?? ""));
  if (m.layout === "mercury" && NOT_COMPLETED.test(get(m.status).trim())) return "not_completed";
  const date = parseDate(get(m.date));
  const raw = rowAmount(cells, m);
  const description = get(m.description).trim();
  if (!date || raw === null || !description) return null;
  const amount = m.invert !== flipSigns ? -raw : raw;
  const cardholder = get(m.cardholder).trim() || null;
  const explicitType = m.layout === "rho" ? get(m.type).trim() : "";
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
  const account = get(m.account).trim() || accountId;
  const first = cardholder?.split(" ")[0];
  return {
    // The upload id keeps rows unique when one account is exported as several files.
    id: `csv_${accountId}_${account}_${rowNo}`,
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

/**
 * Card payoffs from checking are transfers when the card's own rows are also present (shown by the
 * incoming leg of a payoff); otherwise they are the only trace of that card's spend.
 * Decide this over everything uploaded together, never file by file, or card spend gets counted twice.
 */
export function resolveCardPayoffs(transactions: readonly RhoTransaction[]): { transactions: RhoTransaction[]; cardSpendAsPayoffs: boolean } {
  const payoffs = transactions.filter((t) => t.transaction_type === "credit_repayment");
  // Only the incoming leg proves the card account was uploaded: a named row may be a debit-card purchase.
  const cardRowsPresent = payoffs.some((t) => t.amount.amount > 0);
  const cardSpendAsPayoffs = payoffs.length > 0 && !cardRowsPresent;
  return {
    transactions: cardSpendAsPayoffs ? transactions.map((t) => (t.transaction_type === "credit_repayment" ? { ...t, transaction_type: UNITEMIZED_CARD_SPEND } : t)) : [...transactions],
    cardSpendAsPayoffs,
  };
}

/** Parses one exported file. Throws when the columns aren't recognised; skips (and reports) unreadable rows. */
export function importCsv(text: string, { accountId, resolvePayoffs = true, flipSigns = false }: { accountId: string; resolvePayoffs?: boolean; flipSigns?: boolean }): CsvImport {
  const rows = parseCsv(text);
  const m = findMapping(rows);
  if (!m) throw new Error("Unrecognised columns: expected at least Date, Description and Amount (or Debit and Credit)");
  const transactions: RhoTransaction[] = [];
  const skipped: number[] = [];
  rows.slice(m.headerRow + 1).forEach((cells, i) => {
    const line = m.headerRow + i + 2;
    const t = rowToTransaction(cells, m, accountId, line, flipSigns);
    if (t === "not_completed") return;
    if (t) transactions.push(t);
    else skipped.push(line);
  });
  const mostlyPositive = transactions.length > 0 && transactions.filter((t) => t.amount.amount > 0).length / transactions.length > MOSTLY_POSITIVE_SHARE;
  // Our own export ("rho") carries explicit types, so its payoffs are already right.
  const resolved = resolvePayoffs && m.layout !== "rho" ? resolveCardPayoffs(transactions) : { transactions, cardSpendAsPayoffs: false };
  return { layout: m.layout, transactions: resolved.transactions, skipped, cardSpendAsPayoffs: resolved.cardSpendAsPayoffs, mostlyPositive };
}
