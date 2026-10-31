import "server-only";
import { buildDigest, digestInputFromAnalysis, type Digest } from "../insights/digest";
import type { Change } from "../insights/changes";
import { postToSlack } from "../slack";
import { loadAnalysis, type DataMode } from "./data";
import { env } from "./env";
import { scopeFor } from "./scope";
import { getStore } from "./store";

export interface DigestPreview extends Digest {
  changes: Change[];
}

const COMPANY: Record<string, string> = { demo: "Taco Robotics, Inc. (demo data)", rho_sandbox: "Rho sandbox", rho: "your company" };

function appUrl(): string | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : undefined;
}

/** The digest for one data source, leaving out findings people dismissed. */
export async function buildDigestFor(mode: DataMode): Promise<DigestPreview> {
  const { dataset, analysis } = await loadAnalysis(mode);
  let dismissed = new Set<string>();
  try {
    const statuses = await getStore(scopeFor(mode)).syncFindings(analysis.findings);
    dismissed = new Set([...statuses].filter(([, s]) => s === "dismissed").map(([id]) => id));
  } catch (err) {
    // Without the store the digest still goes out; it just can't honour dismissals this time.
    console.error("[digest] couldn't read finding statuses", err);
  }
  const input = digestInputFromAnalysis(analysis, { company: COMPANY[scopeFor(mode)] ?? dataset.label, dismissed, appUrl: appUrl() });
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
