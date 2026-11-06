import "server-only";
import { verifySavings, type SavingsSummary } from "../insights/savings";
import type { Analysis } from "../pipeline";
import type { AcceptedFinding, Store } from "../store/types";
import type { DataMode, Dataset } from "./data";
import { scopeFor } from "./scope";
import { getStore } from "./store";

/** Verified savings for everything people acted on: stored decisions plus any history shipped with the data. */
export async function savingsFor(mode: DataMode, dataset: Dataset, analysis: Analysis): Promise<SavingsSummary> {
  return savingsFromStore(getStore(await scopeFor(mode)), dataset, analysis);
}

/** The same, for a store already resolved (the cron works by company scope, outside any request). */
export async function savingsFromStore(store: Store, dataset: Dataset, analysis: Analysis): Promise<SavingsSummary> {
  let stored: AcceptedFinding[] = [];
  try {
    stored = await store.listAcceptedFindings();
  } catch (err) {
    console.error("[savings] couldn't read accepted findings", err);
  }
  // A stored decision about the same finding wins over shipped history.
  const seen = new Set(stored.map((f) => f.fingerprint));
  const all = [...(dataset.actedOn ?? []).filter((f) => !seen.has(f.fingerprint)), ...stored];
  try {
    return verifySavings(all, analysis.txns, analysis.asOf);
  } catch (err) {
    // One odd record must never take down the dashboard, digest or investor update.
    console.error("[savings] verification failed", err);
    return { checks: [], verifiedMonthlyCents: 0, verifiedOneTimeCents: 0, pendingMonthlyCents: 0 };
  }
}
