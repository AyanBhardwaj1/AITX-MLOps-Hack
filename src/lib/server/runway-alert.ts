import "server-only";
import { cashFreshness, dataFreshness, STALE_AFTER_DAYS } from "../freshness";
import { formatDate } from "../format";
import { nextRunwayAlert } from "../insights/runway-alert";
import { formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import { postToSlack, SlackError } from "../slack";
import type { Store } from "../store/types";

const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Rounded as the dashboard rounds, or down where that would read as over the line ("3.0, under 3"). */
const shownMonths = (months: number, below: number) => (Number(months.toFixed(1)) >= below ? (Math.floor(months * 10) / 10).toFixed(1) : months.toFixed(1));

/** The Slack message for runway crossing a line (server-written text; the company name escaped). */
export function runwayAlertText({ company, runwayMonths, below, netBurnCents, zeroCashDate, link }: { company: string; runwayMonths: number; below: number; netBurnCents: number; zeroCashDate: string | null; link?: string }): string {
  const when = zeroCashDate ? ` At ${formatDollars(netBurnCents)}/month net burn, cash runs out around ${formatDate(zeroCashDate)}.` : "";
  return [`*Runway alert for ${slackEscape(company)}*`, `Runway is down to *${shownMonths(runwayMonths, below)} months*, under ${below}.${when}`, ...(link ? [`<${link}|Open Runway>`] : [])].join("\n");
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
  rowsAddedAt,
  company,
  now,
  link,
  post = postToSlack,
}: {
  store: Store;
  load: () => Promise<Analysis>;
  /** When today's cash was last entered (ISO); runway from a figure weeks old says nothing. */
  cashEnteredAt?: () => Promise<string | undefined>;
  /** When an upload last added rows (ISO): judged as the upload reminder judges it. */
  rowsAddedAt?: () => Promise<string | undefined>;
  company: string;
  now: Date;
  link?: string;
  post?: (url: string, text: string) => Promise<void>;
}): Promise<RunwayAlertResult> {
  const url = await store.getSlackWebhook();
  if (!url) return { status: "no_slack" };
  const analysis = await load();
  // Whole days, by the same rule as the upload reminder, so the two never both post.
  if (dataFreshness(analysis.asOf, now, await rowsAddedAt?.(), analysis.txns?.map((t) => t.postedAt)).stale) return { status: "none" };
  const entered = await cashEnteredAt?.();
  if (entered !== undefined) {
    const cash = cashFreshness(entered, now);
    if (!cash || cash.daysOld >= STALE_AFTER_DAYS) return { status: "none" };
  }
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
    .recordActivity({ actorEmail: null, kind: "alert", detail: `Told Slack: runway dropped under ${next.store} months (${shownMonths(runwayMonths, next.store)})` })
    .catch((err) => console.error("[runway-alert] couldn't log the alert", err instanceof Error ? err.message : "unknown error"));
  return { status: "sent", below: next.store };
}
