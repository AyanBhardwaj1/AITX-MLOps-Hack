import type { Analysis } from "../pipeline";
import type { Finding } from "../types";

/**
 * CSV downloads for spreadsheets and board prep. Vendor names and details come from bank
 * descriptors, which anyone can influence, so text that a spreadsheet would run as a formula is
 * prefixed with an apostrophe (OWASP "CSV injection").
 */

type Cell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = FORMULA_START.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const dollars = (cents: number) => Math.round(cents) / 100;

export function recurringCsv(a: Analysis): string {
  return toCsv(
    ["Vendor", "Category", "What it does", "Cadence", "Per month (USD)", "Last charge", "Next charge", "Cardholders"],
    a.streams
      .filter((s) => s.active)
      .toSorted((x, y) => y.monthlyCostCents - x.monthlyCostCents)
      .map((s) => [s.vendorName, s.category, s.job, s.cadence, dollars(s.monthlyCostCents), s.lastDate, s.nextExpected, s.cardholders.join("; ")]),
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
