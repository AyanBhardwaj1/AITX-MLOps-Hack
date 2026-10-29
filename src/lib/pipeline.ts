import { detectFindings } from "./detect/findings";
import { applyVendorLabels } from "./enrich/vendor-labels";
import { detectStreams } from "./detect/recurring";
import { computeSnapshot, type Snapshot } from "./finance/runway";
import { cashBalanceCents, mapTransaction } from "./rho/map";
import type { RhoAccount, RhoTransaction } from "./rho/schema";
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
  /** Defaults to the latest transaction date, so a stale feed still has recent "complete months". */
  asOf?: IsoDate;
  /** LLM labels for vendors the catalog doesn't know (see enrich/vendor-labels). */
  vendorLabels?: ReadonlyMap<string, VendorInfo>;
}

function timed<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const out = fn();
  return [out, Math.round((performance.now() - start) * 100) / 100];
}

/** Rho data in, runway and findings out. Pure and deterministic: no network, no LLM. */
export function analyze({ accounts, transactions, asOf, vendorLabels }: AnalyzeInput): Analysis {
  const [txns, mapMs] = timed(() => {
    const mapped = transactions.map(mapTransaction).filter((t): t is EnrichedTxn => t !== null);
    return vendorLabels?.size ? applyVendorLabels(mapped, vendorLabels) : mapped;
  });
  const latest = txns.reduce<IsoDate>((max, t) => (t.postedAt > max ? t.postedAt : max), "0000-00-00");
  const effectiveAsOf = asOf ?? latest;
  const [snapshot, snapMs] = timed(() => computeSnapshot({ cashCents: cashBalanceCents(accounts), txns, asOf: effectiveAsOf }));
  const [detected, detectMs] = timed(() => ({
    streams: detectStreams(txns, effectiveAsOf),
    findings: detectFindings(txns, effectiveAsOf),
  }));
  return {
    asOf: effectiveAsOf,
    asOfFromData: asOf === undefined,
    txns,
    snapshot,
    ...detected,
    timingsMs: { map: mapMs, snapshot: snapMs, detect: detectMs },
  };
}
