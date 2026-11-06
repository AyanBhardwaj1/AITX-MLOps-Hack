import "server-only";
import { buildDigest, digestInputFromAnalysis, type Digest } from "../insights/digest";
import type { Change } from "../insights/changes";
import { postToSlack } from "../slack";
import { loadAnalysis, type DataMode } from "./data";
import { savingsFor } from "./savings";
import { env } from "./env";
import { companyName } from "./company";
import { scopeFor } from "./scope";
import { getStore } from "./store";

export interface DigestPreview extends Digest {
  changes: Change[];
}


/** The product itself (the site root is the public landing page), on the digest's data source. */
function appUrl(mode: DataMode): string | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/app${mode === "demo" ? "" : `?mode=${mode}`}` : undefined;
}

/** The digest for one data source, leaving out findings people dismissed. */
export async function buildDigestFor(mode: DataMode): Promise<DigestPreview> {
  const { dataset, analysis } = await loadAnalysis(mode);
  // Leave out dismissed findings and ones already acted on (tracked under "Acted on").
  let exclude = new Set<string>();
  try {
    const statuses = await getStore(await scopeFor(mode)).syncFindings(analysis.findings);
    exclude = new Set([...statuses].filter(([, s]) => s !== "open").map(([id]) => id));
  } catch (err) {
    // Without the store the digest still goes out; it just can't honour decisions this time.
    console.error("[digest] couldn't read finding statuses", err);
  }
  const savings = await savingsFor(mode, dataset, analysis);
  const input = digestInputFromAnalysis(analysis, { company: mode === "demo" ? `${await companyName(mode)} (demo data)` : await companyName(mode), exclude, appUrl: appUrl(mode), savings });
  return { ...buildDigest(input), changes: [...input.changes] };
}

/** Builds and posts the digest to Slack. Throws when Slack isn't configured or rejects it. */
export async function sendDigest(mode: DataMode): Promise<DigestPreview> {
  const url = env().SLACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_WEBHOOK_URL is not set");
  const digest = await buildDigestFor(mode);
  await postToSlack(url, digest.slack);
  return digest;
}
