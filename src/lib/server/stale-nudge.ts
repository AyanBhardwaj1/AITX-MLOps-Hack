import "server-only";
import { dataFreshness } from "../freshness";
import { formatDate } from "../format";
import type { Analysis } from "../pipeline";
import { postToSlack, SlackError } from "../slack";
import type { Store } from "../store/types";

const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export type StaleNudgeResult = { status: "sent"; daysOld: number } | { status: "none" } | { status: "no_slack" } | { status: "disconnected" };

/**
 * Once a company's uploaded data is two weeks old (when the alerts go quiet), its own Slack hears
 * it once for that export: upload a fresh one. The claim is per latest-transaction date, so a new
 * export that goes stale gets its own reminder; a refused post gives the claim back.
 */
export async function sendStaleNudge({
  store,
  load,
  company,
  now,
  link,
  post = postToSlack,
}: {
  store: Store;
  load: () => Promise<Analysis>;
  company: string;
  now: Date;
  link?: string;
  post?: (url: string, text: string) => Promise<void>;
}): Promise<StaleNudgeResult> {
  const url = await store.getSlackWebhook();
  if (!url) return { status: "no_slack" };
  const { asOf } = await load();
  const { daysOld, stale } = dataFreshness(asOf, now);
  if (!stale || !(await store.claimStaleNudge(asOf))) return { status: "none" };
  const text = [
    `*Runway for ${slackEscape(company)} needs fresh numbers*`,
    `Your transactions end on ${formatDate(asOf)}, ${daysOld} days ago, so runway, budgets and alerts are working from old data. Upload a fresh export from your bank and update today's cash.`,
    ...(link ? [`<${link}|Upload an export>`] : []),
  ].join("\n");
  try {
    await post(url, text);
  } catch (err) {
    await store.releaseStaleNudge(asOf).catch(() => undefined);
    if (err instanceof SlackError && (err.status === 404 || err.status === 410)) {
      await store.setSlackWebhook(null).catch(() => undefined);
      return { status: "disconnected" };
    }
    throw err;
  }
  await store
    .recordActivity({ actorEmail: null, kind: "alert", detail: `Told Slack: the data ends ${formatDate(asOf)} (${daysOld} days ago)` })
    .catch((err) => console.error("[stale-nudge] couldn't log the reminder", err instanceof Error ? err.message : "unknown error"));
  return { status: "sent", daysOld };
}
