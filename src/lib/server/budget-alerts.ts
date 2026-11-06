import "server-only";
import { budgetStatus, type BudgetRow } from "../finance/budgets";
import { categoryName, formatMoney } from "../format";
import type { Analysis } from "../pipeline";
import { postToSlack, SlackError } from "../slack";
import type { Store } from "../store/types";

const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const plainLabel = (category: string) => categoryName(category)[0]!.toUpperCase() + categoryName(category).slice(1);
const label = (category: string) => slackEscape(plainLabel(category));
const listed = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

/** The Slack message for budgets that just went over (server-written text; the company name escaped). */
export function budgetAlertText({ company, month, rows, link }: { company: string; month: string; rows: readonly BudgetRow[]; link?: string }): string {
  const lines = rows.map((r) => `• *${label(r.category)}* is over budget: ${formatMoney(r.monthToDateCents)} so far of ${formatMoney(r.monthlyCents)} in ${monthName(month)}.`);
  return [`*Budget alert for ${slackEscape(company)}*`, ...lines, ...(link ? [`<${link}|See budgets in Runway>`] : [])].join("\n");
}

export type BudgetAlertResult = { status: "sent"; categories: string[] } | { status: "none" } | { status: "no_slack" } | { status: "disconnected" };

/**
 * Posts to the company's own Slack when a budget first goes over in a month: one message for
 * every budget that newly went over, never again for the same budget that month. Only the
 * current month counts, so old uploads don't announce last month's news. The data is read only
 * when there's a channel and a budget to check. Throws when Slack refuses (the claims are given
 * back, so the next run tries again); a webhook Slack removed is disconnected instead.
 */
export async function sendBudgetAlerts({
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
}): Promise<BudgetAlertResult> {
  const url = await store.getSlackWebhook();
  if (!url) return { status: "no_slack" };
  const budgets = await store.listBudgets();
  if (budgets.length === 0) return { status: "none" };
  const analysis = await load();
  const month = analysis.asOf.slice(0, 7);
  if (month !== now.toISOString().slice(0, 7)) return { status: "none" };

  const over = budgetStatus(analysis.txns, analysis.asOf, budgets, analysis.streams).filter((r) => r.status === "over");
  const claimed: BudgetRow[] = [];
  try {
    for (const row of over) if (await store.claimBudgetAlert(row.category, month)) claimed.push(row);
    if (claimed.length === 0) return { status: "none" };
    await post(url, budgetAlertText({ company, month, rows: claimed, link }));
  } catch (err) {
    // Whatever failed (a claim or the post), every claim made so far goes back.
    await Promise.all(claimed.map((r) => store.releaseBudgetAlert(r.category, month).catch(() => undefined)));
    if (err instanceof SlackError && (err.status === 404 || err.status === 410)) {
      // Removed on Slack's side: disconnect, as the digest does, so the owner sees it in settings.
      await store.setSlackWebhook(null).catch(() => undefined);
      return { status: "disconnected" };
    }
    throw err;
  }
  // The team sees what Slack was told, credited to Runway; a hiccup here never undoes the post.
  await store
    .recordActivity({ actorEmail: null, kind: "alert", detail: `Told Slack: ${listed(claimed.map((r) => plainLabel(r.category)))} went over budget in ${monthName(month)}` })
    .catch((err) => console.error("[budget-alerts] couldn't log the alert", err instanceof Error ? err.message : "unknown error"));
  return { status: "sent", categories: claimed.map((r) => r.category) };
}
