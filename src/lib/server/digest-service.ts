import "server-only";
import { buildDigest, digestInputFromAnalysis, type Digest } from "../insights/digest";
import type { Change } from "../insights/changes";
import { postToSlack } from "../slack";
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
async function digestFrom({ store, dataset, analysis, company, link }: { store: Store; dataset: Dataset; analysis: Analysis; company: string; link: string | undefined }): Promise<DigestPreview> {
  // Leave out dismissed findings and ones already acted on (tracked under "Acted on").
  let exclude = new Set<string>();
  try {
    const statuses = await store.syncFindings(analysis.findings);
    exclude = new Set([...statuses].filter(([, s]) => s !== "open").map(([id]) => id));
  } catch (err) {
    // Without the store the digest still goes out; it just can't honour decisions this time.
    console.error("[digest] couldn't read finding statuses", err);
  }
  const savings = await savingsFromStore(store, dataset, analysis);
  const input = digestInputFromAnalysis(analysis, { company, exclude, appUrl: link, savings });
  return { ...buildDigest(input), changes: [...input.changes] };
}

/** The digest for one data source (resolved from the session for a company). */
export async function buildDigestFor(mode: DataMode): Promise<DigestPreview> {
  const { dataset, analysis } = await loadAnalysis(mode);
  const company = mode === "demo" ? `${await companyName(mode)} (demo data)` : await companyName(mode);
  return digestFrom({ store: getStore(await scopeFor(mode)), dataset, analysis, company, link: appUrl(mode) });
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

/**
 * The Monday digest for every company that connected its own Slack, each from its own data to its
 * own webhook. Scopes come from the server's list, never a request; stops starting new ones when the
 * time budget is spent.
 */
export async function sendCompanyDigests({ budgetMs }: { budgetMs: number }): Promise<{ sent: number; failed: number; skipped: number }> {
  const deadline = Date.now() + budgetMs;
  const scopes = await listCompanyScopesWithSlack(MAX_DIGEST_COMPANIES);
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const [i, scope] of scopes.entries()) {
    if (Date.now() >= deadline) {
      result.skipped = scopes.length - i;
      break;
    }
    try {
      const store = getStore(scope);
      const url = await store.getSlackWebhook();
      if (!url) continue;
      const dataset = await loadCompanyLabelled(scope);
      const analysis = analyze(dataset);
      const company = (await getAccounts().nameForScope(scope)) ?? "Your company";
      const digest = await digestFrom({ store, dataset, analysis, company, link: appUrl("company") });
      await postToSlack(url, digest.slack);
      result.sent += 1;
    } catch (err) {
      console.error("[digest] company digest failed", { scope, error: err instanceof Error ? err.message : "unknown error" });
      result.failed += 1;
    }
  }
  return result;
}
