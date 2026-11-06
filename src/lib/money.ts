import type { Cents } from "./types";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** $1,234.56 */
export function formatCents(cents: Cents): string {
  return USD.format(cents / 100);
}

/** $1,235 for headline numbers. */
export function formatDollars(cents: Cents): string {
  return USD_WHOLE.format(cents / 100);
}

/**
 * Typed dollars ("$1,234.50") as integer cents, worked out on the digits so no float rounding
 * creeps in. Null for anything else: negatives, more than two decimals, or too big to be exact.
 */
export function parseDollarsToCents(text: string): Cents | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/[$,\s]/g, ""));
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
