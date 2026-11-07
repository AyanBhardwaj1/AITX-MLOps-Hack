import { detectFindings } from "./detect/findings";
import { applyVendorLabels } from "./enrich/vendor-labels";
import { detectStreams } from "./detect/recurring";
import { computeSnapshot, type Snapshot } from "./finance/runway";
import { cashBalanceCents, mapTransaction } from "./rho/map";
import type { RhoAccount, RhoTransaction } from "./rho/schema";
import { applyCorrections, type VendorCorrection } from "./vendors/corrections";
import type { EnrichedTxn, Finding, IsoDate, RecurringStream, VendorInfo } from "./types";

export interface Analysis {
  asOf: IsoDate;
  /** True when asOf came from the data (e.g. the static Rho sandbox) rather than today. */
  asOfFromData: boolean;
  txns: EnrichedTxn[];
  snapshot: Snapshot;
  streams: RecurringStream[];
  findings: Finding[];
  timingsMs: Record<"map" | "snapshot" | "detect", number>;
}

export interface AnalyzeInput {
  accounts: readonly RhoAccount[];
  transactions: readonly RhoTransaction[];
  /** Defaults to the latest transaction date, so a stale feed still has recent "complete months" (today when there are none). */
  asOf?: IsoDate;
  /** LLM labels for vendors the catalog doesn't know (see enrich/vendor-labels). */
  vendorLabels?: ReadonlyMap<string, VendorInfo>;
  /** People's own category fixes, keyed by vendor key; applied last, so they win (see vendors/corrections). */
  corrections?: ReadonlyMap<string, VendorCorrection>;
}

function timed<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const out = fn();
  return [out, Math.round((performance.now() - start) * 100) / 100];
}

/** Rho data in, runway and findings out. Deterministic given an as-of date (only an empty feed with none reads the clock): no network, no LLM. */
/**
 * The transactions with their vendors, LLM labels and people's fixes applied: the first step of the
 * analysis, on its own for pages that only list transactions (it skips the costly detection).
 */
export function enrichTransactions({ transactions, vendorLabels, corrections }: Pick<AnalyzeInput, "transactions" | "vendorLabels" | "corrections">): EnrichedTxn[] {
  const mapped = transactions.map(mapTransaction).filter((t): t is EnrichedTxn => t !== null);
  const labelled = vendorLabels?.size ? applyVendorLabels(mapped, vendorLabels) : mapped;
  return corrections?.size ? applyCorrections(labelled, corrections) : labelled;
}

export function analyze({ accounts, transactions, asOf, vendorLabels, corrections }: AnalyzeInput): Analysis {
  const [txns, mapMs] = timed(() => enrichTransactions({ transactions, vendorLabels, corrections }));
  const latest = txns.reduce<IsoDate | null>((max, t) => (max === null || t.postedAt > max ? t.postedAt : max), null);
  // A feed with nothing usable in it (a new account, or only failed rows) is as of today.
  const effectiveAsOf = asOf ?? latest ?? new Date().toISOString().slice(0, 10);
  const [snapshot, snapMs] = timed(() => computeSnapshot({ cashCents: cashBalanceCents(accounts), txns, asOf: effectiveAsOf }));
  const [detected, detectMs] = timed(() => {
    // Streams once: the findings are worked out from the same ones.
    const streams = detectStreams(txns, effectiveAsOf);
    return { streams, findings: detectFindings(txns, effectiveAsOf, streams) };
  });
  return {
    asOf: effectiveAsOf,
    // An empty feed is as of today, not of a transaction.
    asOfFromData: asOf === undefined && latest !== null,
    txns,
    snapshot,
    ...detected,
    timingsMs: { map: mapMs, snapshot: snapMs, detect: detectMs },
  };
}
