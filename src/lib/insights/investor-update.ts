import type { MonthHistory } from "../finance/history";
import { monthlyHistory } from "../finance/history";
import { projectScenario, type ScenarioResult } from "../finance/scenario";
import { formatDate } from "../format";
import { formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import type { Cents, IsoDate } from "../types";

/**
 * A monthly investor update drafted from the bank feed: the numbers are computed, and the
 * parts only the founder knows (wins, misses, asks) are left as marked placeholders rather
 * than invented. Pure and deterministic.
 */

export interface InvestorUpdateInput {
  company: string;
  asOf: IsoDate;
  /** Complete months, oldest first. */
  history: MonthHistory[];
  cashCents: Cents;
  netBurnCents: Cents;
  grossBurnCents: Cents;
  runwayMonths: number;
  zeroCashDate: IsoDate | null;
  scenario: Pick<ScenarioResult, "defaultAlive" | "breakEvenMonth" | "revenueGrowth" | "growthNeededForDefaultAlive">;
  verifiedSavingsCents?: Cents;
}

export interface InvestorUpdate {
  subject: string;
  markdown: string;
}

const HISTORY_MONTHS = 12;
const SPEND_BASELINE_MONTHS = 3;
/** Software/cloud moving less than this vs its average isn't worth a line. */
const SPEND_CHANGE_NOTE = 0.1;
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const monthName = (m: string) => MONTH_NAME.format(new Date(`${m}-01T00:00:00Z`));
const shortMonth = (m: string) => SHORT_MONTH.format(new Date(`${m}-01T00:00:00Z`));
const signedPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function investorUpdateInput(a: Analysis, opts: { company: string; verifiedSavingsCents?: Cents }): InvestorUpdateInput {
  const history = monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS);
  return {
    company: opts.company,
    asOf: a.asOf,
    history,
    cashCents: a.snapshot.cashCents,
    netBurnCents: a.snapshot.netBurnCents,
    grossBurnCents: a.snapshot.grossBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    zeroCashDate: a.snapshot.zeroCashDate,
    scenario: projectScenario({ asOf: a.asOf, cashCents: a.snapshot.cashCents, history }),
    verifiedSavingsCents: opts.verifiedSavingsCents,
  };
}

function revenueLine(history: readonly MonthHistory[], growth: number): string {
  const last = history.at(-1);
  const prev = history.at(-2);
  if (!last || last.inflowCents <= 0) return "- **Revenue:** No revenue yet.";
  const vs = prev && prev.inflowCents > 0 ? ` (${signedPct((last.inflowCents - prev.inflowCents) / prev.inflowCents)} vs ${shortMonth(prev.month)}` : " (first revenue month";
  return `- **Revenue:** ${formatDollars(last.inflowCents)} in ${shortMonth(last.month)}${vs}; ${(growth * 100).toFixed(1)}%/month over the last 6 months)`;
}

function spendLine(history: readonly MonthHistory[]): string | null {
  const last = history.at(-1);
  const base = history.slice(-SPEND_BASELINE_MONTHS - 1, -1);
  if (!last || base.length === 0) return null;
  const avg = base.reduce((s, m) => s + m.softwareCents, 0) / base.length;
  if (avg <= 0 || Math.abs(last.softwareCents - avg) / avg < SPEND_CHANGE_NOTE) return null;
  return `- **Software, cloud & AI:** ${formatDollars(last.softwareCents)} in ${shortMonth(last.month)} (${signedPct((last.softwareCents - avg) / avg)} vs the prior ${base.length}-month average)`;
}

function aliveLine(s: InvestorUpdateInput["scenario"]): string {
  if (s.defaultAlive) return `- **Default alive (revenue growth vs. spend):** yes, break-even around month ${s.breakEvenMonth} if growth holds`;
  const need = s.growthNeededForDefaultAlive === null ? "not reachable on growth alone" : `needs ${(s.growthNeededForDefaultAlive * 100).toFixed(1)}%/month growth`;
  return `- **Default alive (revenue growth vs. spend):** not yet (${need})`;
}

export function buildInvestorUpdate(input: InvestorUpdateInput): InvestorUpdate {
  const month = input.history.at(-1)?.month ?? input.asOf.slice(0, 7);
  const runway = Number.isFinite(input.runwayMonths)
    ? `**${input.runwayMonths.toFixed(1)} months** of runway${input.zeroCashDate ? ` (to about ${formatDate(input.zeroCashDate)})` : ""}`
    : "cash-flow positive";
  const numbers = [
    revenueLine(input.history, input.scenario.revenueGrowth),
    `- **Net burn:** ${formatDollars(input.netBurnCents)}/month (3-month average); gross spend ${formatDollars(input.grossBurnCents)}/month`,
    `- **Cash:** ${formatDollars(input.cashCents)}, so ${runway}`,
    aliveLine(input.scenario),
    spendLine(input.history),
    input.verifiedSavingsCents ? `- **Spend cuts:** ${formatDollars(input.verifiedSavingsCents)}/month of tool spend cut and verified on our bank statements` : null,
  ].filter((l) => l !== null);

  const subject = `${input.company}: ${monthName(month)} update`;
  const markdown = [
    `# ${subject}`,
    `Hi all, here's where we stand at the end of ${monthName(month)}. The numbers come straight from our bank feed.`,
    "## The numbers",
    numbers.join("\n"),
    "## Highlights",
    "- [Add 2–3 wins: customers, launches, key hires]",
    "## Lowlights",
    "- [Add what didn't go to plan and what you're doing about it]",
    "## Asks",
    "- [Add specific intros or help you need]",
    "Thanks,\n[Your name]",
  ].join("\n\n");
  return { subject, markdown };
}
