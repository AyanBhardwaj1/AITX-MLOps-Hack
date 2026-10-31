import { z } from "zod";
import { categoryName, formatDate } from "../format";
import { formatCents, formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import { INSTANT_QUESTIONS, type InstantQuestion } from "./instant-questions";
import { getChanges, getFinancialSnapshot, getForecast, getUpcomingRenewals, listFindings, planToTarget, runScenario } from "./tools";

/**
 * "Instant answers": Copilot's suggested questions answered without a language model, by calling
 * the same tools the agent would and filling a fixed template. Used when OPENAI_API_KEY isn't set,
 * so the demo still shows what Copilot does, and labelled as not AI-written.
 */

export { INSTANT_QUESTIONS, type InstantQuestion };
export const instantQuestionInput = z.enum(Object.keys(INSTANT_QUESTIONS) as [InstantQuestion, ...InstantQuestion[]]);

export interface InstantAnswer {
  question: string;
  /** Tool names called, in order (shown as the same chips the agent shows). */
  tools: string[];
  /** Markdown: paragraphs, "- " bullets and **bold** only. */
  text: string;
}

const TARGET_MONTHS = 14;
const RENEWAL_DAYS = 60;
const MAX_LISTED = 6;
/** Spend we never suggest cutting unprompted. */
const PROTECTED = new Set(["payroll", "rent", "revenue", "transfer"]);
const months = (n: number | null) => (n === null ? "unlimited" : `${n.toFixed(1)} months`);
const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? `${months(lo)} to ${months(hi)}` : `${lo.toFixed(1)} to ${hi.toFixed(1)} months`);

function target14(a: Analysis): InstantAnswer {
  const plan = planToTarget(a, { targetRunwayMonths: TARGET_MONTHS });
  const snap = getFinancialSnapshot(a);
  const lines = [
    `You have **${months(snap.runwayMonths)}** of runway today (cash ${formatDollars(snap.cashCents)}, net burn ${formatDollars(snap.netBurnCentsPerMonth)}/month).`,
  ];
  if (plan.chosenFindings.length) {
    lines.push(
      "Acting on the detected waste, biggest first:",
      plan.chosenFindings.map((f) => `- ${f.title} (saves ${formatDollars(f.monthlySavingsCents)}/month)`).join("\n"),
      `That saves **${formatDollars(plan.monthlySavingsCents)}/month** and takes runway to **${months(plan.projectedRunwayMonths)}**.`,
    );
  }
  if (plan.reachesTarget) {
    lines.push(`That reaches ${TARGET_MONTHS} months without touching payroll.`);
  } else {
    const places = Object.entries(snap.avgMonthlySpendByCategoryCents)
      .filter(([c]) => !PROTECTED.has(c))
      .slice(0, 3)
      .map(([c, cents]) => `${categoryName(c)} (${formatDollars(cents)}/month)`);
    lines.push(
      `To reach ${TARGET_MONTHS} months you'd still need to cut **${formatDollars(plan.remainingGapCentsPerMonth)}/month** more.` +
        (places.length ? ` Your largest non-payroll spend is ${places.join(", ")}.` : ""),
    );
  }
  return { question: INSTANT_QUESTIONS.target_14, tools: ["plan_to_target", "get_financial_snapshot"], text: lines.join("\n\n") };
}

function payTwice(a: Analysis): InstantAnswer {
  const overlaps = listFindings(a, { kind: "duplicate_tools" });
  const doubles = listFindings(a, { kind: "duplicate_charge" });
  const all = [...overlaps, ...doubles];
  if (all.length === 0) {
    return { question: INSTANT_QUESTIONS.pay_twice, tools: ["list_findings"], text: "Nothing: no overlapping tools or double charges found." };
  }
  const monthly = all.reduce((s, f) => s + f.monthlySavingsCents, 0);
  const refunds = all.reduce((s, f) => s + f.oneTimeCents, 0);
  const lines = [
    all
      .slice(0, MAX_LISTED)
      .map((f) => `- **${f.title}** (${f.monthlySavingsCents ? `saves ${formatDollars(f.monthlySavingsCents)}/month` : `${formatCents(f.oneTimeCents)} to refund`})`)
      .join("\n"),
    `In total that's **${formatDollars(monthly)}/month**` + (refunds ? ` plus **${formatCents(refunds)}** to claim back.` : "."),
    "Tick them under Waste found to see the effect on runway, or run Autopilot to draft a ticket for each.",
  ];
  return { question: INSTANT_QUESTIONS.pay_twice, tools: ["list_findings"], text: lines.join("\n\n") };
}

function howLong(a: Analysis): InstantAnswer {
  const f = getForecast(a);
  const snap = getFinancialSnapshot(a);
  const lines = [
    `At today's burn, about **${months(snap.runwayMonths)}**` + (snap.zeroCashDate ? ` (cash runs out around ${snap.zeroCashDate}).` : "."),
    `From ${f.method}, the likely range is **${range(f.runwayMonths.p10, f.runwayMonths.p90)}**. There's a 1-in-10 chance it's shorter than ${months(f.runwayMonths.p10)}.`,
    `If revenue fell 30%, runway would be **${months(snap.runwayMonthsIfRevenueFalls30Pct)}**.`,
  ];
  return { question: INSTANT_QUESTIONS.how_long, tools: ["get_runway_forecast", "get_financial_snapshot"], text: lines.join("\n\n") };
}

function renewals(a: Analysis): InstantAnswer {
  const r = getUpcomingRenewals(a, { days: RENEWAL_DAYS });
  if (r.renewals.length === 0) {
    return { question: INSTANT_QUESTIONS.renewals, tools: ["get_upcoming_renewals"], text: `No recurring charges are due in the next ${RENEWAL_DAYS} days.` };
  }
  const decide = r.renewals.filter((x) => x.decide);
  const rest = r.renewals.length - decide.length;
  const lines = [`**${formatDollars(r.totalCents)}** across ${r.renewals.length} charges is due in the next ${RENEWAL_DAYS} days.`];
  if (decide.length) {
    lines.push(
      "Decide on these before they renew (annual, quarterly or $5k+):",
      decide
        .slice(0, MAX_LISTED)
        .map((x) => `- **${x.vendorName}** ${x.cadence}: ${formatCents(x.amountCents)} on ${x.dueDate} (in ${x.daysAway} days)`)
        .join("\n"),
    );
  }
  if (rest > 0) lines.push(`The other ${rest} are routine bills; the full list is under Coming up.`);
  return { question: INSTANT_QUESTIONS.renewals, tools: ["get_upcoming_renewals"], text: lines.join("\n\n") };
}

function defaultAlive(a: Analysis): InstantAnswer {
  const s = runScenario(a, {});
  const growth = `${s.revenueGrowthPctPerMonth.toFixed(1)}%/month`;
  const need = s.growthNeededForDefaultAlivePctPerMonth;
  const lines = s.defaultAlive
    ? [
        `**Yes, default alive.** Revenue has grown about ${growth} over the last 6 months. If that holds and spend stays flat, revenue covers expenses in **month ${s.breakEvenMonth}**, before the cash runs out.`,
        need !== null ? `The margin: growth needs to stay above **${need.toFixed(1)}%/month**. Below that, you'd need to raise or cut.` : "",
      ]
    : [
        `**No, default dead.** At ${growth} revenue growth with flat spend, cash runs out${s.zeroCashDate ? ` around ${formatDate(s.zeroCashDate)}` : ""} before revenue catches up with expenses.`,
        need !== null
          ? `Growth would need to reach **${need.toFixed(1)}%/month** to make it on current cash. Otherwise plan cuts or a raise now: raising usually takes 6+ months.`
          : "Growth alone can't close the gap on current cash: plan cuts or a raise now.",
      ];
  lines.push("Try hires, a raise or cutting the waste in **Plan ahead** on the dashboard.");
  return { question: INSTANT_QUESTIONS.default_alive, tools: ["plan_scenario"], text: lines.filter(Boolean).join("\n\n") };
}

function whatChanged(a: Analysis): InstantAnswer {
  const changes = getChanges(a);
  const text = changes.length
    ? [`${changes.length} thing${changes.length === 1 ? "" : "s"} worth a look, most urgent first:`, changes.map((c) => `- **${c.title}**: ${c.detail}`).join("\n")].join("\n\n")
    : "Nothing unusual: no spend spikes, new vendors, price changes, large payments or renewals due in the next 14 days.";
  return { question: INSTANT_QUESTIONS.what_changed, tools: ["get_recent_changes"], text };
}

const ANSWERS: Record<InstantQuestion, (a: Analysis) => InstantAnswer> = {
  target_14: target14,
  pay_twice: payTwice,
  how_long: howLong,
  renewals,
  default_alive: defaultAlive,
  what_changed: whatChanged,
};

export function instantAnswer(a: Analysis, question: InstantQuestion): InstantAnswer {
  return ANSWERS[question](a);
}
