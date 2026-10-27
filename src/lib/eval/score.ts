import type { PlantedWaste } from "../seed/demo-company";
import type { Category, EnrichedTxn, Finding, FindingKind } from "../types";

export interface KindScore {
  kind: FindingKind;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

export interface DetectorScore {
  byKind: KindScore[];
  precision: number;
  recall: number;
  /** Share of planted wasted dollars (monthly + one-time) that the detectors found. */
  dollarRecall: number;
  missed: PlantedWaste[];
  unexpected: Finding[];
}

const KINDS: readonly FindingKind[] = ["duplicate_tools", "price_creep", "zombie", "duplicate_charge"];

const matchKey = (kind: FindingKind, vendorKeys: readonly string[]) => `${kind}|${[...vendorKeys].sort().join(",")}`;
const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);
const wasteDollars = (w: PlantedWaste) => w.monthlyCents + w.oneTimeCents;

/** Exact-match scoring: a finding counts only if its kind and vendor set equal a planted item. */
export function scoreFindings(findings: readonly Finding[], truth: readonly PlantedWaste[]): DetectorScore {
  const truthKeys = new Set(truth.map((w) => matchKey(w.kind, w.vendorKeys)));
  const foundKeys = new Set(findings.map((f) => matchKey(f.kind, f.vendorKeys)));
  const missed = truth.filter((w) => !foundKeys.has(matchKey(w.kind, w.vendorKeys)));
  const unexpected = findings.filter((f) => !truthKeys.has(matchKey(f.kind, f.vendorKeys)));

  const byKind = KINDS.map((kind) => {
    const tp = truth.filter((w) => w.kind === kind && foundKeys.has(matchKey(kind, w.vendorKeys))).length;
    const fp = unexpected.filter((f) => f.kind === kind).length;
    const fn = missed.filter((w) => w.kind === kind).length;
    return { kind, truePositives: tp, falsePositives: fp, falseNegatives: fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
  });

  const tp = truth.length - missed.length;
  const totalDollars = truth.reduce((s, w) => s + wasteDollars(w), 0);
  const foundDollars = truth.filter((w) => !missed.includes(w)).reduce((s, w) => s + wasteDollars(w), 0);
  return {
    byKind,
    precision: ratio(tp, tp + unexpected.length),
    recall: ratio(tp, truth.length),
    dollarRecall: ratio(foundDollars, totalDollars),
    missed,
    unexpected,
  };
}

export interface CategoryScore {
  vendors: number;
  correct: number;
  accuracy: number;
  wrong: { vendorKey: string; expected: Category; got: Category }[];
}

/** Vendor-level categorization accuracy against labels (each vendor counted once). */
export function scoreCategories(txns: readonly EnrichedTxn[], labels: Readonly<Record<string, Category>>): CategoryScore {
  const byVendor = new Map(txns.filter((t) => labels[t.vendor.key] !== undefined).map((t) => [t.vendor.key, t.vendor.category]));
  const wrong = [...byVendor]
    .filter(([key, got]) => labels[key] !== got)
    .map(([vendorKey, got]) => ({ vendorKey, expected: labels[vendorKey]!, got }));
  return { vendors: byVendor.size, correct: byVendor.size - wrong.length, accuracy: ratio(byVendor.size - wrong.length, byVendor.size), wrong };
}
