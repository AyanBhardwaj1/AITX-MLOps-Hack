import "server-only";
import { forecastCash } from "../finance/forecast";
import { monthlyHistory } from "../finance/history";
import { runwayHistory } from "../finance/runway-history";
import { cashAccountIds } from "../rho/map";
import { buildShareSnapshot, shareSnapshot, type ShareSnapshot } from "../share/snapshot";
import { hashShareToken, isShareToken, shareLinkState } from "../share/token";
import { loadAnalysis, type DataMode } from "./data";
import { getStore } from "./store";

const FORECAST_HISTORY_MONTHS = 12;
const COMPANY: Record<DataMode, string> = { demo: "Taco Robotics, Inc. (fictional demo)", sandbox: "Your company" };

/** Today's headline numbers for a data source, as a share link freezes them (shared data only, no visitor fixes). */
export async function snapshotFor(mode: DataMode, company = COMPANY[mode]): Promise<ShareSnapshot> {
  const { dataset, analysis: a } = await loadAnalysis(mode);
  const forecast = forecastCash({ cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, FORECAST_HISTORY_MONTHS), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf });
  const history = runwayHistory({ txns: a.txns, cashAccountIds: cashAccountIds(dataset.accounts), cashCents: a.snapshot.cashCents, asOf: a.asOf });
  return buildShareSnapshot({ company, analysis: a, forecast, history });
}

/** Stored links live with the real data sources; the public demo never stores any. */
const LINK_SCOPES = ["rho", "rho_sandbox"] as const;

export type ShareLookup = { kind: "sample"; snapshot: ShareSnapshot } | { kind: "link"; snapshot: ShareSnapshot; expiresAt: string; label: string | null } | { kind: "gone" };

/** Resolves /s/<token>: the live demo sample, an active link, or "gone" (unknown, expired, revoked, or unreadable). */
export async function lookupShare(token: string): Promise<ShareLookup> {
  if (token === "demo") return { kind: "sample", snapshot: await snapshotFor("demo") };
  if (!isShareToken(token)) return { kind: "gone" };
  const hash = hashShareToken(token);
  for (const scope of LINK_SCOPES) {
    const link = await getStore(scope)
      .findShareLink(hash)
      .catch((err) => {
        console.error("[share] lookup failed", err);
        return null;
      });
    if (!link) continue;
    if (shareLinkState(link) !== "active") return { kind: "gone" };
    const parsed = shareSnapshot.safeParse(link.payload);
    return parsed.success ? { kind: "link", snapshot: parsed.data, expiresAt: link.expiresAt, label: link.label } : { kind: "gone" };
  }
  return { kind: "gone" };
}
