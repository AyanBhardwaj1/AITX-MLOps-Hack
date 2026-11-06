import "server-only";
import { dataFreshness } from "../freshness";
import { formatDate } from "../format";
import { nextRunwayAlert } from "../insights/runway-alert";
import { formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import { postToSlack, SlackError } from "../slack";
import type { Store } from "../store/types";

const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The Slack message for runway crossing a line (server-written text; the company name escaped). */
export function runwayAlertText({ company, runwayMonths, below, netBurnCents, zeroCashDate, link }: { company: string; runwayMonths: number; below: number; netBurnCents: number; zeroCashDate: string | null; link?: string }): string {
  const when = zeroCashDate ? ` At ${formatDollars(netBurnCents)}/month net burn, cash runs out around ${formatDate(zeroCashDate)}.` : "";
  return [`*Runway alert for ${slackEscape(company)}*`, `Runway is down to *${runwayMonths.toFixed(1)} months*, under ${below}.${when}`, ...(link ? [`<${link}|Open Runway>`] : [])].join("\n");
}

export type RunwayAlertResult = { status: "sent"; below: number } | { status: "none" } | { status: "no_slack" } | { status: "disconnected" };

/**
 * Posts to the company's own Slack the day runway first drops under 12, 6 or 3 months. The level
 * moves only from the value this run read, so overlapping runs post once; a refused post puts it
 * back. Data two weeks old or more says nothing: that runway is old news.
 */
export async function sendRunwayAlert({
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
}): Promise<RunwayAlertResult> {
  const url = await store.getSlackWebhook();
  if (!url) return { status: "no_slack" };
  const analysis = await load();
  if (dataFreshness(analysis.asOf, now).stale) return { status: "none" };
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
  return { status: "sent", below: next.store };
}
