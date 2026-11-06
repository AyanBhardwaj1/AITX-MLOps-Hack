import type { Analysis } from "../pipeline";
import type { RhoTransaction } from "../rho/schema";
import type { EnrichedTxn, Finding } from "../types";
import type { Prep1099 } from "../finance/form-1099";
import type { CashPnl } from "../finance/cash-pnl";
import { categoryName } from "../format";
import { runwayCostOf, type RunwayCost } from "../finance/runway";
import { describeRunwayCost } from "../format";

/**
 * CSV downloads for spreadsheets and board prep. Vendor names and details come from bank
 * descriptors, which anyone can influence, so text that a spreadsheet would run as a formula is
 * prefixed with an apostrophe (OWASP "CSV injection").
 */

type Cell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;
/** Excel in semicolon locales (de, fr, es…) splits on ";", so a formula after one would start a new cell. */
const FORMULA_AFTER_SEPARATOR = /([;,]\s*)([=+\-@\t\r])/g;
/** Without it, Excel on Windows reads the file as ANSI and garbles names like "José". */
const UTF8_BOM = "\uFEFF";

function cell(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const inner = v.replace(FORMULA_AFTER_SEPARATOR, "$1'$2");
  const safe = FORMULA_START.test(inner) ? `'${inner}` : inner;
  return /[",;\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** CSV a line at a time, for downloads streamed as they're written. */
export function* csvLines(header: readonly string[], rows: Iterable<readonly Cell[]>): Generator<string> {
  yield UTF8_BOM + header.map(cell).join(",") + "\r\n";
  for (const r of rows) yield r.map(cell).join(",") + "\r\n";
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [...csvLines(header, rows)].join("");
}

const dollars = (cents: number) => Math.round(cents) / 100;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Net cash per category per month (money in positive), with a net row: a cash-basis P&L. */
export function cashPnlCsv(pnl: CashPnl | null): string {
  if (!pnl) return toCsv(["Category", "Total"], []);
  return toCsv(
    ["Category", ...pnl.months.map(monthLabel), "Total"],
    [
      ...pnl.rows.map((r) => [capitalised(categoryName(r.category)), ...r.cents.map(dollars), dollars(r.totalCents)]),
      ["Net cash flow", ...pnl.netCents.map(dollars), dollars(pnl.netTotalCents)],
    ],
  );
}

/** The 1099 prep list, for the accountant: who, which form, and what was paid. */
export function form1099Csv(prep: Prep1099 | null): string {
  return toCsv(
    ["Payee", "Form", "Tax year", "Paid (USD)", "Over threshold", "Payments", "First paid", "Last paid"],
    (prep?.rows ?? []).map((r) => [r.name, r.form, prep!.year, dollars(r.paidCents), r.overThreshold ? "yes" : "no", r.payments, r.firstPaid, r.lastPaid]),
  );
}

/** A number of days where there is one, so the column sorts; otherwise the same words as the table. */
const runwayCostCell = (cost: RunwayCost | null) => (cost?.kind === "days" ? cost.days : cost ? describeRunwayCost(cost) : "no end");

export function recurringCsv(a: Analysis): string {
  return toCsv(
    ["Vendor", "Category", "What it does", "Cadence", "Per month (USD)", "Runway it costs (days)", "Last charge", "Next charge", "Cardholders"],
    a.streams
      .filter((s) => s.active)
      .toSorted((x, y) => y.monthlyCostCents - x.monthlyCostCents)
      .map((s) => [s.vendorName, s.category, s.job, s.cadence, dollars(s.monthlyCostCents), runwayCostCell(runwayCostOf(a.snapshot, s.monthlyCostCents)), s.lastDate, s.nextExpected, s.cardholders.join(" / ")]),
  );
}

const KIND: Record<Finding["kind"], string> = {
  duplicate_tools: "Overlapping tools",
  price_creep: "Bill increase",
  zombie: "Idle-card subscriptions",
  duplicate_charge: "Double charge",
};

export function findingsCsv(findings: readonly Finding[], statuses: ReadonlyMap<string, string>): string {
  return toCsv(
    ["Finding", "Kind", "Monthly savings (USD)", "One-time (USD)", "Confidence", "Status", "Detail"],
    findings.map((f) => [f.title, KIND[f.kind], dollars(f.monthlySavingsCents), dollars(f.oneTimeCents), Math.round(f.confidence * 100) / 100, statuses.get(f.id) ?? "open", f.detail]),
  );
}

/**
 * Every uploaded transaction, in Runway's own column layout (Date, Description, Amount, Type, Account,
 * Cardholder), so the download is a backup that can be uploaded again without duplicating anything.
 */
export function uploadsCsvLines(rows: readonly RhoTransaction[]): Generator<string> {
  const sorted = rows.toSorted((a, b) => (a.posted_at ?? a.initiated_at).localeCompare(b.posted_at ?? b.initiated_at));
  return csvLines(
    ["Date", "Description", "Amount", "Type", "Account", "Cardholder"],
    (function* () {
      for (const t of sorted) yield [(t.posted_at ?? t.initiated_at).slice(0, 10), t.counterparty_name, dollars(t.amount.amount), t.transaction_type, t.account_id, t.user_full_name ?? null];
    })(),
  );
}

export function uploadsCsv(rows: readonly RhoTransaction[]): string {
  return [...uploadsCsvLines(rows)].join("");
}

/** The transactions a search matched (see finance/transaction-search), for an accountant or a spreadsheet. */
export function matchesCsvLines(rows: readonly EnrichedTxn[], accountNames: ReadonlyMap<string, string>): Generator<string> {
  return csvLines(
    ["Date", "Vendor", "Category", "Description", "Account", "Cardholder", "Amount (USD)"],
    (function* () {
      for (const t of rows) yield [t.postedAt, t.vendor.name, t.vendor.category, t.description, accountNames.get(t.accountId) ?? t.accountId, t.cardholder ?? null, dollars(t.amountCents)];
    })(),
  );
}

export function matchesCsv(rows: readonly EnrichedTxn[], accountNames: ReadonlyMap<string, string>): string {
  return [...matchesCsvLines(rows, accountNames)].join("");
}
