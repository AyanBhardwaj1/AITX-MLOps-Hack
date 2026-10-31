import { monthlyHistory } from "../finance/history";
import { projectScenario, type ScenarioResult } from "../finance/scenario";
import { formatDate } from "../format";
import { formatCents, formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import type { Cents, Finding, IsoDate } from "../types";
import { detectChanges, type Change } from "./changes";
import type { SavingsSummary } from "./savings";

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
  scenario: Pick<ScenarioResult, "defaultAlive" | "breakEvenMonth" | "revenueGrowth" | "growthNeededForDefaultAlive" | "zeroCashDate">;
  changes: readonly Change[];
  /** Open (not dismissed) findings. */
  findings: readonly Finding[];
  /** Verification of what people acted on, when known. */
  savings?: SavingsSummary;
  appUrl?: string;
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
  { company, dismissed, appUrl, savings }: { company: string; dismissed: ReadonlySet<string>; appUrl?: string; savings?: SavingsSummary },
): DigestInput {
  return {
    company,
    asOf: a.asOf,
    cashCents: a.snapshot.cashCents,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    scenario: projectScenario({ asOf: a.asOf, cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS) }),
    changes: detectChanges({ txns: a.txns, streams: a.streams, asOf: a.asOf, runwayMonths: a.snapshot.runwayMonths }),
    findings: a.findings.filter((f) => !dismissed.has(f.id)),
    savings,
    appUrl,
  };
}

// A tiny document model so one digest renders to both Markdown and Slack without drift.
type Span = string | { bold: string };
type Block = { kind: "p"; spans: Span[] } | { kind: "h"; text: string } | { kind: "ul"; items: Span[][] } | { kind: "link"; url: string; text: string };

const pct = (g: number) => `${(g * 100).toFixed(1)}%`;

function verdict(s: DigestInput["scenario"]): Span[] {
  const growth = `${pct(s.revenueGrowth)}/month`;
  if (s.defaultAlive) {
    const need = s.growthNeededForDefaultAlive === null ? "" : ` (needs at least ${pct(s.growthNeededForDefaultAlive)})`;
    return ["Default alive: ", { bold: "yes" }, `, break-even in month ${s.breakEvenMonth} if revenue keeps growing ${growth}${need}.`];
  }
  const out = s.zeroCashDate ? `cash runs out around ${formatDate(s.zeroCashDate)}` : "profitability isn't reached within 5 years";
  const fix =
    s.growthNeededForDefaultAlive === null
      ? " Growth alone can't fix this: cut spend or raise."
      : ` Revenue would need to grow ${pct(s.growthNeededForDefaultAlive)}/month.`;
  return ["Default alive: ", { bold: "no" }, `. At ${growth} revenue growth, ${out}.${fix}`];
}

function blocks(d: DigestInput): Block[] {
  const runway: Span[] = Number.isFinite(d.runwayMonths)
    ? [{ bold: `${d.runwayMonths.toFixed(1)} months` }, ` of runway: ${formatDollars(d.cashCents)} cash, ${formatDollars(d.netBurnCents)}/month net burn.`]
    : [{ bold: "Cash-flow positive" }, `: ${formatDollars(d.cashCents)} cash and no net burn.`];
  const monthly = d.findings.reduce((s, f) => s + f.monthlySavingsCents, 0);
  const oneTime = d.findings.reduce((s, f) => s + f.oneTimeCents, 0);
  const top = d.findings.filter((f) => f.monthlySavingsCents > 0).toSorted((x, y) => y.monthlySavingsCents - x.monthlySavingsCents);
  const out: Block[] = [
    { kind: "p", spans: [`As of ${formatDate(d.asOf)}.`] },
    { kind: "p", spans: runway },
    { kind: "p", spans: verdict(d.scenario) },
    { kind: "h", text: "What changed" },
    d.changes.length
      ? { kind: "ul", items: d.changes.map((c) => [{ bold: c.title }, `: ${c.detail}`]) }
      : { kind: "p", spans: ["Nothing unusual this week."] },
    { kind: "h", text: "Waste to act on" },
  ];
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
