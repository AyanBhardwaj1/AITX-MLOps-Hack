import { STALE_AFTER_DAYS } from "../freshness";
import { monthlyHistory } from "../finance/history";
import { describeGrowth, projectScenario, type ScenarioResult } from "../finance/scenario";
import { categoryName, formatDate, formatMoney } from "../format";
import type { BudgetRow } from "../finance/budgets";
import { formatCents, formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import type { Cents, Finding, IsoDate } from "../types";
import { detectChanges, type Change } from "./changes";
import type { SavingsSummary } from "./savings";
import { burnBridge, type BurnBridge } from "../finance/burn-bridge";

/**
 * The Monday digest: runway, the default-alive verdict, what changed, and the waste still open.
 * Built from the same deterministic numbers as the dashboard, then rendered as Markdown (in-app
 * preview) and Slack mrkdwn (delivery). No LLM: every figure is computed, never written.
 */

export interface DigestInput {
  company: string;
  asOf: IsoDate;
  cashCents: Cents;
  netBurnCents: Cents;
  runwayMonths: number;
  scenario: Pick<ScenarioResult, "defaultAlive" | "breakEvenMonth" | "revenueGrowth" | "growthBasis" | "growthNeededForDefaultAlive" | "zeroCashDate">;
  changes: readonly Change[];
  /** Open findings: not dismissed, and not already acted on (those are tracked under "Acted on"). */
  findings: readonly Finding[];
  /** Verification of what people acted on, when known. */
  savings?: SavingsSummary;
  appUrl?: string;
  /** Days since the latest uploaded transaction (company data only); two weeks or more is called out first. */
  staleDays?: number;
  /** The company's budgets this month; only those over or heading over are named. */
  budgets?: readonly BudgetRow[];
  /** Last complete month's net burn against the month before, vendor by vendor. */
  bridge?: BurnBridge | null;
}

export interface Digest {
  title: string;
  markdown: string;
  slack: string;
}

const HISTORY_MONTHS = 12;
const TOP_FINDINGS = 3;

export function digestInputFromAnalysis(
  a: Analysis,
  { company, exclude, appUrl, savings }: { company: string; exclude: ReadonlySet<string>; appUrl?: string; savings?: SavingsSummary },
): DigestInput {
  return {
    company,
    asOf: a.asOf,
    cashCents: a.snapshot.cashCents,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    scenario: projectScenario({ asOf: a.asOf, cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS), burn: a.snapshot }),
    changes: detectChanges({ txns: a.txns, streams: a.streams, asOf: a.asOf, runwayMonths: a.snapshot.runwayMonths }),
    findings: a.findings.filter((f) => !exclude.has(f.id)),
    bridge: burnBridge(a.txns, a.asOf),
    savings,
    appUrl,
  };
}

// A tiny document model so one digest renders to both Markdown and Slack without drift.
type Span = string | { bold: string };
type Block = { kind: "p"; spans: Span[] } | { kind: "h"; text: string } | { kind: "ul"; items: Span[][] } | { kind: "link"; url: string; text: string };

const pct = (g: number) => `${(g * 100).toFixed(1)}%`;

function verdict(s: DigestInput["scenario"]): Span[] {
  const measured = describeGrowth(s.revenueGrowth, s.growthBasis);
  const growth = measured ?? "flat revenue (too little revenue history to measure growth)";
  if (s.defaultAlive) {
    const need =
      s.growthNeededForDefaultAlive === null ? "" : s.growthNeededForDefaultAlive <= 0 ? " (it holds even if growth stops)" : ` (needs at least ${pct(s.growthNeededForDefaultAlive)})`;
    const holds = measured ? `if revenue keeps growing ${measured}` : "even at flat revenue";
    return ["Default alive: ", { bold: "yes" }, `, break-even in month ${s.breakEvenMonth} ${holds}${need}.`];
  }
  const out = s.zeroCashDate ? `cash runs out around ${formatDate(s.zeroCashDate)}` : "lasting profitability isn't reached within 5 years";
  const fix =
    s.growthNeededForDefaultAlive === null
      ? " Growth alone can't fix this: cut spend or raise."
      : ` Revenue would need to grow ${pct(s.growthNeededForDefaultAlive)}/month.`;
  return ["Default alive: ", { bold: "no" }, `. At ${measured ? `${growth} revenue growth` : growth}, ${out}.${fix}`];
}

function blocks(d: DigestInput): Block[] {
  const runway: Span[] = Number.isFinite(d.runwayMonths)
    ? [{ bold: `${d.runwayMonths.toFixed(1)} months` }, ` of runway: ${formatDollars(d.cashCents)} cash, ${formatDollars(d.netBurnCents)}/month net burn.`]
    : [{ bold: "Cash-flow positive" }, `: ${formatDollars(d.cashCents)} cash and no net burn.`];
  const monthly = d.findings.reduce((s, f) => s + f.monthlySavingsCents, 0);
  const oneTime = d.findings.reduce((s, f) => s + f.oneTimeCents, 0);
  const top = d.findings.filter((f) => f.monthlySavingsCents > 0).toSorted((x, y) => y.monthlySavingsCents - x.monthlySavingsCents);
  const stale = d.staleDays !== undefined && d.staleDays >= STALE_AFTER_DAYS;
  const out: Block[] = [
    stale
      ? { kind: "p", spans: [{ bold: `Your transactions end on ${formatDate(d.asOf)}, ${d.staleDays} days ago` }, ", so these numbers may have drifted: upload a fresh export and update today's cash."] }
      : { kind: "p", spans: [`As of ${formatDate(d.asOf)}.`] },
    { kind: "p", spans: runway },
    { kind: "p", spans: verdict(d.scenario) },
    { kind: "h", text: "What changed" },
    d.changes.length
      ? { kind: "ul", items: d.changes.map((c) => [{ bold: c.title }, `: ${c.detail}`]) }
      : { kind: "p", spans: ["Nothing unusual this week."] },
  ];
  if (d.bridge && d.bridge.changeCents !== 0) {
    const b = d.bridge;
    const name = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const signed = (c: number) => `${c > 0 ? "+" : "−"}${formatDollars(Math.abs(c))}`;
    out.push(
      { kind: "h", text: "Why burn moved" },
      b.netBurnCents <= 0
        ? { kind: "p", spans: [`In ${name(b.month)} more came in than went out: cash-flow positive by `, { bold: formatDollars(-b.netBurnCents) }, `; net burn ${b.changeCents > 0 ? "up" : "down"} ${formatDollars(Math.abs(b.changeCents))} on ${name(b.previous)}.`] }
        : { kind: "p", spans: [`Net burn in ${name(b.month)} was `, { bold: formatDollars(b.netBurnCents) }, `, ${b.changeCents > 0 ? "up" : "down"} ${formatDollars(Math.abs(b.changeCents))} on ${name(b.previous)}.`] },
    );
    const items: Span[][] = b.drivers.slice(0, TOP_FINDINGS).map((x) => [`${x.name}${x.kind === "new" ? " (new)" : x.kind === "stopped" ? " (stopped)" : ""}: ${signed(x.changeCents)}`]);
    if (b.revenueChangeCents) items.push([`${b.revenueChangeCents > 0 ? "More" : "Less"} money in: ${signed(-b.revenueChangeCents)}`]);
    if (items.length) out.push({ kind: "ul", items });
  }
  if (d.budgets?.length) {
    const off = d.budgets.filter((b) => b.status !== "under");
    const label = (c: BudgetRow["category"]) => categoryName(c)[0]!.toUpperCase() + categoryName(c).slice(1);
    const monthName = new Date(`${d.asOf.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const lastDay = new Date(Date.UTC(Number(d.asOf.slice(0, 4)), Number(d.asOf.slice(5, 7)), 0)).getUTCDate();
    out.push({ kind: "h", text: `Budgets, ${monthName}${Number(d.asOf.slice(8, 10)) === lastDay ? "" : " so far"}` });
    out.push(
      off.length
        ? {
            kind: "ul",
            items: off.map((b) =>
              b.status === "over"
                ? [{ bold: `${label(b.category)} over budget` }, `: ${formatMoney(b.monthToDateCents)} so far of ${formatMoney(b.monthlyCents)}.`]
                : [{ bold: `${label(b.category)} heading over` }, `: ${formatMoney(b.projectedCents)} likely of ${formatMoney(b.monthlyCents)}.`],
            ),
          }
        : { kind: "p", spans: [`Your ${d.budgets.length} budget${d.budgets.length === 1 ? " is" : "s are all"} on track.`] },
    );
  }
  out.push({ kind: "h", text: "Waste to act on" });
  if (d.findings.length === 0) {
    out.push({ kind: "p", spans: ["No open waste findings."] });
  } else {
    out.push({
      kind: "p",
      spans: [{ bold: `${formatDollars(monthly)}/month` }, ` across ${d.findings.length} findings${oneTime ? `, plus ${formatCents(oneTime)} to reclaim` : ""}.`],
    });
    if (top.length) out.push({ kind: "ul", items: top.slice(0, TOP_FINDINGS).map((f) => [`${f.title} (saves ${formatDollars(f.monthlySavingsCents)}/month)`]) });
  }
  if (d.savings?.checks.length) {
    const still = d.savings.checks.filter((c) => c.status === "still_charging");
    out.push(
      { kind: "h", text: "Acted on" },
      {
        kind: "p",
        spans: [
          { bold: `${formatDollars(d.savings.verifiedMonthlyCents)}/month` },
          ` verified saved (the charges stopped)${d.savings.pendingMonthlyCents ? `; ${formatDollars(d.savings.pendingMonthlyCents)}/month still being checked` : ""}.`,
        ],
      },
    );
    if (still.length) out.push({ kind: "ul", items: still.map((c) => [{ bold: `Still charging: ${c.title}` }, ". The cancellation or price change didn't take; follow up with the vendor."]) });
  }
  if (d.appUrl) out.push({ kind: "link", url: d.appUrl, text: "Open Runway" });
  return out;
}

const md = (spans: Span[]) => spans.map((s) => (typeof s === "string" ? s : `**${s.bold}**`)).join("");
/** Slack treats &, < and > as control characters (mentions, links). */
const slackEscape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const slackSpans = (spans: Span[]) => spans.map((s) => (typeof s === "string" ? slackEscape(s) : `*${slackEscape(s.bold)}*`)).join("");

function toMarkdown(title: string, bs: Block[]): string {
  const body = bs.map((b) => {
    if (b.kind === "h") return `## ${b.text}`;
    if (b.kind === "ul") return b.items.map((i) => `- ${md(i)}`).join("\n");
    if (b.kind === "link") return `${b.text}: ${b.url}`;
    return md(b.spans);
  });
  return [`# ${title}`, ...body].join("\n\n");
}

function toSlack(title: string, bs: Block[]): string {
  const body = bs.map((b) => {
    if (b.kind === "h") return `*${slackEscape(b.text)}*`;
    if (b.kind === "ul") return b.items.map((i) => `• ${slackSpans(i)}`).join("\n");
    if (b.kind === "link") return `<${b.url}|${slackEscape(b.text)}>`;
    return slackSpans(b.spans);
  });
  return [`*${slackEscape(title)}*`, ...body].join("\n\n");
}

export function buildDigest(input: DigestInput): Digest {
  const title = `Runway weekly: ${input.company}`;
  const bs = blocks(input);
  return { title, markdown: toMarkdown(title, bs), slack: toSlack(title, bs) };
}
