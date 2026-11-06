import "server-only";
import { buildDigest, digestInputFromAnalysis, type Digest } from "../insights/digest";
import type { Change } from "../insights/changes";
import { postToSlack, SlackError } from "../slack";
import { dataFreshness } from "../freshness";
import { analyze, type Analysis } from "../pipeline";
import type { Store } from "../store/types";
import { loadAnalysis, loadCompanyLabelled, type DataMode, type Dataset } from "./data";
import { savingsFromStore } from "./savings";
import { env } from "./env";
import { companyName, getAccounts } from "./company";
import { scopeFor } from "./scope";
import { getStore, listCompanyScopesWithSlack } from "./store";

export interface DigestPreview extends Digest {
  changes: Change[];
}


/** The product itself (the site root is the public landing page), on the digest's data source. */
function appUrl(mode: DataMode): string | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/app${mode === "demo" ? "" : `?mode=${mode}`}` : undefined;
}

/** The digest from a company's data and its store, leaving out findings people decided on. */
async function digestFrom({ store, dataset, analysis, company, link, uploaded }: { store: Store; dataset: Dataset; analysis: Analysis; company: string; link: string | undefined; uploaded: boolean }): Promise<DigestPreview> {
  // Leave out dismissed findings and ones already acted on (tracked under "Acted on").
  let exclude = new Set<string>();
  try {
    const statuses = await store.syncFindings(analysis.findings);
    exclude = new Set([...statuses].filter(([, s]) => s !== "open").map(([id]) => id));
  } catch (err) {
    // Without the store the digest still goes out; it just can't honour decisions this time.
    console.error("[digest] couldn't read finding statuses", err instanceof Error ? err.message : "unknown error");
  }
  const savings = await savingsFromStore(store, dataset, analysis);
  const input = digestInputFromAnalysis(analysis, { company, exclude, appUrl: link, savings });
  // Uploaded data goes stale between uploads; say so before anyone trusts the numbers.
  const staleDays = uploaded ? dataFreshness(analysis.asOf, new Date()).daysOld : undefined;
  return { ...buildDigest({ ...input, staleDays }), changes: [...input.changes] };
}

/** The digest for one data source (resolved from the session for a company). */
export async function buildDigestFor(mode: DataMode): Promise<DigestPreview> {
  const { dataset, analysis } = await loadAnalysis(mode);
  const company = mode === "demo" ? `${await companyName(mode)} (demo data)` : await companyName(mode);
  return digestFrom({ store: getStore(await scopeFor(mode)), dataset, analysis, company, link: appUrl(mode), uploaded: mode === "company" });
}

/** Builds and posts the digest to the operator's Slack (env). Throws when Slack isn't configured or rejects it. */
export async function sendDigest(mode: DataMode): Promise<DigestPreview> {
  const url = env().SLACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_WEBHOOK_URL is not set");
  const digest = await buildDigestFor(mode);
  await postToSlack(url, digest.slack);
  return digest;
}

/** The signed-in company's digest, posted to the company's own Slack. Null when it hasn't connected one. */
export async function sendCompanyDigestNow(): Promise<DigestPreview | null> {
  const store = getStore(await scopeFor("company"));
  const url = await store.getSlackWebhook();
  if (!url) return null;
  const digest = await buildDigestFor("company");
  await postToSlack(url, digest.slack);
  return digest;
}

/** Most companies one Monday run looks at; digests are quick, the webhook call is the slow part. */
const MAX_DIGEST_COMPANIES = 500;

/** Digests in flight at once: the Slack call is the slow part, so a few overlap. */
const DIGEST_CONCURRENCY = 4;

export interface CompanyDigestsResult {
  sent: number;
  failed: number;
  /** Webhooks Slack says no longer exist (404/410): disconnected, so they stop failing every week. */
  disconnected: number;
  /** Companies left for next time because the time budget ran out (they go first then). */
  skipped: number;
}

/**
 * The Monday digest for every company that connected its own Slack, each from its own data to its
 * own webhook. Scopes come from the server's list (longest waiting first), never a request; a few
 * run at once, and no new one starts once the time budget is spent.
 */
export async function sendCompanyDigests({ budgetMs }: { budgetMs: number }): Promise<CompanyDigestsResult> {
  const deadline = Date.now() + budgetMs;
  const queue = await listCompanyScopesWithSlack(MAX_DIGEST_COMPANIES);
  const result: CompanyDigestsResult = { sent: 0, failed: 0, disconnected: 0, skipped: 0 };
  const worker = async () => {
    for (let scope = queue.shift(); scope !== undefined; scope = queue.shift()) {
      if (Date.now() >= deadline) {
        result.skipped += 1 + queue.length;
        queue.length = 0;
        return;
      }
      await sendOneCompanyDigest(scope, result);
    }
  };
  await Promise.all(Array.from({ length: DIGEST_CONCURRENCY }, worker));
  return result;
}

async function sendOneCompanyDigest(scope: string, result: CompanyDigestsResult): Promise<void> {
  const store = getStore(scope);
  try {
    const url = await store.getSlackWebhook();
    if (!url) return;
    const dataset = await loadCompanyLabelled(scope);
    const analysis = analyze(dataset);
    const company = (await getAccounts().nameForScope(scope)) ?? "Your company";
    const digest = await digestFrom({ store, dataset, analysis, company, link: appUrl("company"), uploaded: true });
    await postToSlack(url, digest.slack);
    await store.markDigestSent();
    result.sent += 1;
  } catch (err) {
    if (err instanceof SlackError && (err.status === 404 || err.status === 410)) {
      // Removed on Slack's side: disconnect, so the owner sees it in settings and it stops failing.
      await store.setSlackWebhook(null).catch(() => undefined);
      result.disconnected += 1;
      return;
    }
    console.error("[digest] company digest failed", { scope, error: err instanceof Error ? err.message : "unknown error" });
    result.failed += 1;
  }
}
