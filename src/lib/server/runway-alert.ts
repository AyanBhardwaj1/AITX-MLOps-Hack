import "server-only";
import { dataFreshness, STALE_AFTER_DAYS } from "../freshness";
import { formatDate } from "../format";
import { nextRunwayAlert } from "../insights/runway-alert";
import { formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import { postToSlack, SlackError } from "../slack";
import type { Store } from "../store/types";

const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Rounded down, so it never reads as over the line it's under ("3.0, under 3"). */
const shownMonths = (months: number) => (Math.floor(months * 10) / 10).toFixed(1);

/** The Slack message for runway crossing a line (server-written text; the company name escaped). */
export function runwayAlertText({ company, runwayMonths, below, netBurnCents, zeroCashDate, link }: { company: string; runwayMonths: number; below: number; netBurnCents: number; zeroCashDate: string | null; link?: string }): string {
  const when = zeroCashDate ? ` At ${formatDollars(netBurnCents)}/month net burn, cash runs out around ${formatDate(zeroCashDate)}.` : "";
  return [`*Runway alert for ${slackEscape(company)}*`, `Runway is down to *${shownMonths(runwayMonths)} months*, under ${below}.${when}`, ...(link ? [`<${link}|Open Runway>`] : [])].join("\n");
}

export type RunwayAlertResult = { status: "sent"; below: number } | { status: "none" } | { status: "no_slack" } | { status: "disconnected" };

/**
 * Posts to the company's own Slack the day runway first drops under 12, 6 or 3 months. The level
 * moves only from the value this run read, so overlapping runs post once; a refused post puts it
 * back. Transactions or cash two weeks old or more say nothing: that runway is old news.
 */
export async function sendRunwayAlert({
  store,
  load,
  cashEnteredAt,
  company,
  now,
  link,
  post = postToSlack,
}: {
  store: Store;
  load: () => Promise<Analysis>;
  /** When today's cash was last entered (ISO); runway from a figure weeks old says nothing. */
  cashEnteredAt?: () => Promise<string | undefined>;
  company: string;
  now: Date;
  link?: string;
  post?: (url: string, text: string) => Promise<void>;
}): Promise<RunwayAlertResult> {
  const url = await store.getSlackWebhook();
  if (!url) return { status: "no_slack" };
  const analysis = await load();
  if (dataFreshness(analysis.asOf, now).stale) return { status: "none" };
  const entered = await cashEnteredAt?.();
  if (entered !== undefined && !(Date.parse(entered) > now.getTime() - STALE_AFTER_DAYS * 86_400_000)) return { status: "none" };
  const { runwayMonths, netBurnCents, zeroCashDate } = analysis.snapshot;
  const stored = await store.runwayAlertLevel();
  const next = nextRunwayAlert(runwayMonths, stored);
  if (next.store === stored) return { status: "none" };
  if (!(await store.setRunwayAlertLevel(stored, next.store)) || !next.alert || next.store === null) return { status: "none" };
  try {
    await post(url, runwayAlertText({ company, runwayMonths, below: next.store, netBurnCents, zeroCashDate, link }));
  } catch (err) {
    await store.setRunwayAlertLevel(next.store, stored).catch(() => false);
    if (err instanceof SlackError && (err.status === 404 || err.status === 410)) {
      await store.setSlackWebhook(null).catch(() => undefined);
      return { status: "disconnected" };
    }
    throw err;
  }
  // The team sees what Slack was told, credited to Runway; a hiccup here never undoes the post.
  await store
    .recordActivity({ actorEmail: null, kind: "alert", detail: `Told Slack: runway dropped under ${next.store} months (${shownMonths(runwayMonths)})` })
    .catch((err) => console.error("[runway-alert] couldn't log the alert", err instanceof Error ? err.message : "unknown error"));
  return { status: "sent", below: next.store };
}
