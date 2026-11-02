import { zeroCashDate } from "../finance/runway";
import type { Cents, IsoDate } from "../types";

/**
 * The public site's calculator: runway from two numbers a founder knows by heart. Pure and
 * browser-safe. The product itself measures burn from transactions instead.
 */

const SUFFIX: Record<string, number> = { "": 1, k: 1_000, m: 1_000_000 };

/** "$1,200,000", "1.2m", "150k" → cents; null for anything that isn't a non-negative amount. */
export function parseDollars(raw: string): Cents | null {
  const match = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([kKmM]?)$/.exec(raw.trim());
  if (!match) return null;
  const whole = match[1]!.replaceAll(",", "");
  const value = Number(`${whole}${match[2] ?? ""}`) * SUFFIX[match[3]!.toLowerCase()]!;
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export type QuickRunway = { kind: "burning"; months: number; zeroCashDate: IsoDate | null } | { kind: "positive" } | { kind: "out" };

export function quickRunway({ cashCents, burnCents, asOf }: { cashCents: Cents; burnCents: Cents; asOf: IsoDate }): QuickRunway {
  if (burnCents <= 0) return { kind: "positive" };
  if (cashCents <= 0) return { kind: "out" };
  const months = cashCents / burnCents;
  return { kind: "burning", months, zeroCashDate: zeroCashDate(asOf, months) };
}
