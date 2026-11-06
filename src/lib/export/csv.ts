import type { Analysis } from "../pipeline";
import type { RhoTransaction } from "../rho/schema";
import type { Finding } from "../types";

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

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return UTF8_BOM + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const dollars = (cents: number) => Math.round(cents) / 100;

export function recurringCsv(a: Analysis): string {
  return toCsv(
    ["Vendor", "Category", "What it does", "Cadence", "Per month (USD)", "Last charge", "Next charge", "Cardholders"],
    a.streams
      .filter((s) => s.active)
      .toSorted((x, y) => y.monthlyCostCents - x.monthlyCostCents)
      .map((s) => [s.vendorName, s.category, s.job, s.cadence, dollars(s.monthlyCostCents), s.lastDate, s.nextExpected, s.cardholders.join(" / ")]),
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
export function uploadsCsv(rows: readonly RhoTransaction[]): string {
  return toCsv(
    ["Date", "Description", "Amount", "Type", "Account", "Cardholder"],
    rows
      .toSorted((a, b) => (a.posted_at ?? a.initiated_at).localeCompare(b.posted_at ?? b.initiated_at))
      .map((t) => [(t.posted_at ?? t.initiated_at).slice(0, 10), t.counterparty_name, dollars(t.amount.amount), t.transaction_type, t.account_id, t.user_full_name ?? null]),
  );
}
