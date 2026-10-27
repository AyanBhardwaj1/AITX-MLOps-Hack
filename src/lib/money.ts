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
