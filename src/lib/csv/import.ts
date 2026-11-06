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

export type CsvLayout = "rho" | "mercury" | "generic" | "headerless" | "ofx";

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
const CARD_PAYOFF_PATTERN = /\b(CARD PAYMENT|AUTOPAY|E-?PAYMENT|PAYMENT\W+THANK YOU|ONLINE PAYMENT)\b/i;
/**
 * Money a customer sends ("ONLINE PAYMENT FROM ACME CORP") reads like a payoff but is money in;
 * from one of the company's own accounts ("PAYMENT FROM CHECKING", "… FROM CHK 1234") it's the
 * card's side of a payoff.
 */
const PAYMENT_FROM = /\bPAYMENT\W+FROM\b/i;
const FROM_OWN_ACCOUNT =
  /\bFROM\W+(?:(?:BUSINESS|OPERATING|PRIMARY)\s+)?(?:(?:CHECKING|CHECK|CHK|SAVINGS|SAV|ACCOUNT|ACCT|DDA|BANK)\b|[X*]+\d*\b|\d{4,}\b)/i;
/** The account files without an account name share on the upload path (uploads/rows.ts DEFAULT_ACCOUNT_LABEL). */
export const SHARED_UPLOAD_ACCOUNT = "uploaded";
/** Days between a payoff leaving checking and arriving on the card. */
const PAYOFF_LEG_DAYS = 10;
/** Moving money between the company's own accounts: never burn. */
const INTERNAL_TRANSFER_PATTERN = /\b(TRANSFER (TO|FROM)|INTERNAL TRANSFER|SWEEP|BOOK TRANSFER)\b/i;
/** Mercury statuses for money that never moved. */
const NOT_COMPLETED = /^(failed|cancel+ed|canceled|declined|reversed)$/i;
export const MOSTLY_POSITIVE_SHARE = 0.7;

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

/**
 * "-1,234.56", "1,234.56-", "(12.00)", "$ (12.00)", "$-12.00", "+5" → cents. A sign anywhere but
 * the ends is refused rather than guessed.
 */
export function parseAmountCents(raw: string): number | null {
  // Spaces (any kind) only around the "$", sign and parentheses, or as a thousands group ("1 234.56"):
  // "12 50" has no safe reading.
  const spaced = raw.replace(/\s+/g, " ").trim().replace(/ ?([$()+-]) ?/g, "$1");
  if (/\d \d/.test(spaced) && !/(^|[^\d ])\d{1,3}( \d{3})+(\.\d{1,2})?([^\d ]|$)/.test(spaced)) return null;
  let s = spaced.replace(/[$ ]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
    if (/^[+-]|-$/.test(s)) return null; // "(-12.00)": two signs, no safe reading
  }
  if (/^[+-]/.test(s)) {
    negative = negative !== s.startsWith("-");
    s = s.slice(1);
  } else if (/-$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  // Commas only as thousands separators: "12,50" (a decimal comma) would otherwise read as 1,250.
  if (s.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return null;
  s = s.replaceAll(",", "");
  // Thirteen digits of dollars at most, so every amount is exact in cents.
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

export type DateOrder = "month-first" | "day-first";
const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/** YYYY-MM-DD (optionally with a time), or NN/NN/YYYY read month-first (US) unless told otherwise. */
/**
 * A file's date order, from its own dates: a first part over 12 means day-first, a second part over
 * 12 means month-first. Both at once can't be read safely (null). Neither: US month-first.
 */
export function dateOrder(values: readonly string[]): DateOrder | null {
  let dayFirst = false;
  let monthFirst = false;
  for (const v of values) {
    const m = SLASHED.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (dayFirst && monthFirst) return null;
  return dayFirst ? "day-first" : "month-first";
}

export function parseDate(raw: string, order: DateOrder = "month-first"): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const slashed = SLASHED.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (slashed) [y, m, d] = order === "day-first" ? [Number(slashed[3]), Number(slashed[2]), Number(slashed[1])] : [Number(slashed[3]), Number(slashed[1]), Number(slashed[2])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Undoes the apostrophe a spreadsheet-safe export puts before text that starts like a formula
 * (ours does, see export/csv.ts), so a downloaded backup re-imports to the same descriptions.
 */
const unguard = (text: string) => text.replace(/^'(?=[=+\-@\t\r])/, "").replace(/([;,]\s*)'([=+\-@\t\r])/g, "$1$2");

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
      // The last of two same-named columns, as the original importer did.
      const i = cols.lastIndexOf(n);
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

/** A file without a header row: the date column, the amount column, and the wordiest text column. */
function headerlessMapping(rows: readonly string[][], flipSigns: boolean): Mapping | null {
  const sample = rows.slice(0, 200);
  if (sample.length === 0) return null;
  const width = Math.max(...sample.map((r) => r.length));
  const share = (col: number, ok: (v: string) => boolean) => sample.filter((r) => ok(r[col] ?? "")).length / sample.length;
  const cols = [...Array(width).keys()];
  const date = cols.find((c) => share(c, (v) => parseDate(v) !== null) >= HEADERLESS_MIN_SHARE);
  if (date === undefined) return null;
  // Only a file whose first row is itself data: an unrecognised header is refused, never guessed past.
  if (parseDate(sample[0]![date] ?? "") === null) return null;
  const cents = (c: number) => sample.map((r) => parseAmountCents(r[c] ?? ""));
  const amountLike = (c: number) => share(c, (v) => parseAmountCents(v) !== null && /\d\.\d{2}\)?-?$/.test(v.trim())) >= HEADERLESS_MIN_SHARE;
  const numeric = cols.filter((c) => c !== date && amountLike(c));
  // A running balance moves by the amount on each row: never take it as the amount.
  const balances = new Set(numeric.filter((b) => numeric.some((a) => a !== b && isBalanceOf(cents(b), cents(a)))));
  const candidates = numeric.filter((c) => !balances.has(c));
  // Spending is negative in a file read this way, so the amount column has both signs, unless the
  // founder said charges are listed as positive.
  const amount = candidates.find((c) => flipSigns || cents(c).some((v) => v !== null && v < 0));
  if (amount === undefined) return null;
  const wordiness = (c: number) => sample.reduce((n, r) => n + ((r[c] ?? "").match(/[A-Za-z]/g)?.length ?? 0), 0);
  const description = cols.filter((c) => c !== date && c !== amount).sort((a, b) => wordiness(b) - wordiness(a))[0];
  if (description === undefined || wordiness(description) === 0) return null;
  return { layout: "headerless", headerRow: -1, date, description, amount, debit: null, credit: null, cardholder: null, account: null, type: null, status: null, invert: false };
}

/** Whether `balance` moves by `amount` on (nearly) every row, as a running balance does. */
function isBalanceOf(balance: readonly (number | null)[], amount: readonly (number | null)[]): boolean {
  let checked = 0;
  let matched = 0;
  for (let i = 1; i < balance.length; i++) {
    const [prev, cur, a] = [balance[i - 1], balance[i], amount[i]];
    if (prev == null || cur == null || a == null) continue;
    checked += 1;
    if (cur - prev === a || prev - cur === a) matched += 1;
  }
  return checked >= 2 && matched / checked >= 0.8;
}

function findMapping(rows: readonly string[][], flipSigns: boolean): Mapping | null {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const m = mappingFromHeader(rows[i]!, i);
    if (m) return m;
  }
  return headerlessMapping(rows, flipSigns);
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

/** A bank row's type from its text and sign: own-account moves, card payoffs, then card or bank spend. */
export function inferTransactionType(description: string, amountCents: number, onCard: boolean): string {
  if (!isRevenuePayout(description) && INTERNAL_TRANSFER_PATTERN.test(description)) return "internal_transfer";
  if (CARD_PAYOFF_PATTERN.test(description)) return "credit_repayment";
  if (onCard) return amountCents < 0 ? "card_debit" : "card_credit";
  return amountCents < 0 ? "ach_debit" : "ach_credit";
}

function rowToTransaction(cells: readonly string[], m: Mapping, accountId: string, rowNo: number, flipSigns: boolean, order: DateOrder): RhoTransaction | "not_completed" | null {
  const get = (col: number | null) => (col === null ? "" : (cells[col] ?? ""));
  if (m.layout === "mercury" && NOT_COMPLETED.test(get(m.status).trim())) return "not_completed";
  const date = parseDate(get(m.date), order);
  const raw = rowAmount(cells, m);
  // Only our own export guards formulas; a bank's text is taken as it is.
  const text = (v: string) => (m.layout === "rho" ? unguard(v.trim()) : v.trim());
  const description = text(get(m.description));
  if (!date || raw === null || !description) return null;
  const amount = m.invert !== flipSigns ? -raw : raw;
  const cardholder = text(get(m.cardholder)) || null;
  const explicitType = m.layout === "rho" ? get(m.type).trim() : "";
  const type = explicitType || inferTransactionType(description, amount, cardholder !== null);
  const account = text(get(m.account)) || accountId;
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
export function resolveCardPayoffs(input: readonly RhoTransaction[]): { transactions: RhoTransaction[]; cardSpendAsPayoffs: boolean } {
  const out = input.filter((t) => t.transaction_type === "credit_repayment" && t.amount.amount < 0);
  // With no payoff going out of an uploaded account, payment rows are the card's own legs (a card
  // file on its own): transfers, whatever bank they name.
  let transactions = [...input];
  if (out.length > 0) {
    // A positive "PAYMENT FROM <a name>" that matches no payment going out is a customer paying
    // ("ONLINE PAYMENT FROM ACME CORP"), not a card's leg. Each payment out matches one leg.
    const day = (t: RhoTransaction) => Date.parse(t.initiated_at.slice(0, 10));
    const unmatched = [...out];
    const matches = (t: RhoTransaction) => {
      // Another account, or the shared default one (unnamed checking and card files are both
      // "uploaded" on the company upload path); on a named account the same amount coming back is
      // a customer, not a card.
      const i = unmatched.findIndex((o) => (o.account_id !== t.account_id || t.account_id === SHARED_UPLOAD_ACCOUNT) && o.amount.amount === -t.amount.amount && Math.abs(day(o) - day(t)) <= PAYOFF_LEG_DAYS * 86_400_000);
      if (i < 0) return false;
      unmatched.splice(i, 1);
      return true;
    };
    const legs = input.filter((t) => t.transaction_type === "credit_repayment" && t.amount.amount > 0);
    // Own-account and thank-you legs first, so a customer can't take their match.
    // Only on an account that itself pays card bills (checking): a card's own payment rows are
    // payoff legs however they're worded, matched or not.
    // An account showing a card's own payment legs ("PAYMENT THANK YOU") is (also) a card's: none
    // of its payment rows are customers.
    const cardish = new Set(input.filter((t) => t.transaction_type === "credit_repayment" && t.amount.amount > 0 && !(PAYMENT_FROM.test(t.counterparty_name) && !FROM_OWN_ACCOUNT.test(t.counterparty_name))).map((t) => t.account_id));
    const paying = new Set(out.map((o) => o.account_id).filter((id) => !cardish.has(id)));
    const customerLike = (t: RhoTransaction) =>
      paying.has(t.account_id) && t.account_type !== "credit" && PAYMENT_FROM.test(t.counterparty_name) && !FROM_OWN_ACCOUNT.test(t.counterparty_name);
    for (const t of legs.filter((l) => !customerLike(l))) matches(t);
    const customers = new Set(legs.filter((l) => customerLike(l) && !matches(l)));
    transactions = input.map((t) => (customers.has(t) ? { ...t, transaction_type: "ach_credit" } : t));
  }
  const payoffs = transactions.filter((t) => t.transaction_type === "credit_repayment");
  // Only the incoming leg proves the card account was uploaded: a named row may be a debit-card purchase.
  const cardRowsPresent = payoffs.some((t) => t.amount.amount > 0);
  const cardSpendAsPayoffs = payoffs.length > 0 && !cardRowsPresent;
  return {
    transactions: cardSpendAsPayoffs ? transactions.map((t) => (t.transaction_type === "credit_repayment" ? { ...t, transaction_type: UNITEMIZED_CARD_SPEND } : t)) : transactions,
    cardSpendAsPayoffs,
  };
}

/** Parses one exported file. Throws when the columns aren't recognised; skips (and reports) unreadable rows. */
/** Runway works in US dollars: a currency column or amount header naming another currency is refused. */
function assertUsd(header: readonly string[], data: readonly string[][]) {
  const cols = header.map(norm);
  const named = cols.map((c) => /\b(amount|debit|credit|gross|net|withdrawals?|deposits?)\s*\(([a-z]{3})\)$/.exec(c)?.[2]).find((code) => code && code !== "usd");
  // The amount's own currency: "Original Currency" (a foreign purchase's, beside a USD amount) isn't it.
  const col = cols.findIndex((c) => /^(?:transaction |settlement )?(?:currency|ccy)(?: code)?$/.test(c));
  const other = col >= 0 ? data.map((r) => (r[col] ?? "").trim().toUpperCase()).find((v) => v && v !== "USD") : undefined;
  if (named || other) throw new Error(`Runway works in US dollars; this file has ${(named ?? other)!.toUpperCase()} amounts.`);
}

export function importCsv(text: string, { accountId, resolvePayoffs = true, flipSigns = false }: { accountId: string; resolvePayoffs?: boolean; flipSigns?: boolean }): CsvImport {
  const rows = parseCsv(text);
  const m = findMapping(rows, flipSigns);
  if (!m) throw new Error("Unrecognised columns: expected at least Date, Description and Amount (or Debit and Credit)");
  const data = rows.slice(m.headerRow + 1);
  assertUsd(rows[m.headerRow] ?? [], data);
  const order = dateOrder(data.map((r) => r[m.date] ?? ""));
  if (!order) throw new Error("Couldn't tell whether the dates are month-first or day-first. Export them as YYYY-MM-DD.");
  const transactions: RhoTransaction[] = [];
  const skipped: number[] = [];
  data.forEach((cells, i) => {
    const line = m.headerRow + i + 2;
    const t = rowToTransaction(cells, m, accountId, line, flipSigns, order);
    if (t === "not_completed") return;
    if (t) transactions.push(t);
    else skipped.push(line);
  });
  const mostlyPositive = transactions.length > 0 && transactions.filter((t) => t.amount.amount > 0).length / transactions.length > MOSTLY_POSITIVE_SHARE;
  // Our own export ("rho") carries explicit types, so its payoffs are already right.
  const resolved = resolvePayoffs && m.layout !== "rho" ? resolveCardPayoffs(transactions) : { transactions, cardSpendAsPayoffs: false };
  return { layout: m.layout, transactions: resolved.transactions, skipped, cardSpendAsPayoffs: resolved.cardSpendAsPayoffs, mostlyPositive };
}
