import { z } from "zod";
import { burnBasis, categoryName, formatDate, formatMoney } from "../format";
import type { Budget } from "../finance/budgets";
import { formatCents, formatDollars } from "../money";
import type { Analysis } from "../pipeline";
import { INSTANT_QUESTIONS, type InstantQuestion } from "./instant-questions";
import { get1099Prep, getMoneyIn, getBudgets, getBurnBridge, getChanges, getCommitted, getPeopleSpend, getFinancialSnapshot, getForecast, getUpcomingRenewals, listFindings, planToTarget, runScenario } from "./tools";

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
const months = (n: number | null) => (n === null ? "no end (cash-flow positive)" : `${n.toFixed(1)} months`);
const range = (lo: number | null, hi: number | null) =>
  lo === null && hi === null ? "no end in any simulation (cash-flow positive)" : lo === null || hi === null ? `${lo === null ? "no end" : `${lo.toFixed(1)} months`} to ${hi === null ? "no end" : `${hi.toFixed(1)} months`}` : `${lo.toFixed(1)} to ${hi.toFixed(1)} months`;

function target14(a: Analysis, dismissed: ReadonlySet<string>): InstantAnswer {
  const plan = planToTarget(a, { targetRunwayMonths: TARGET_MONTHS }, dismissed);
  const snap = getFinancialSnapshot(a);
  const lines = [
    snap.runwayMonths === null
      ? `You're cash-flow positive: about ${formatDollars(-snap.netBurnCentsPerMonth)}/month more comes in than goes out, so cash (${formatDollars(snap.cashCents)}) doesn't run out at today's rate.`
      : `You have **${months(snap.runwayMonths)}** of runway today (cash ${formatDollars(snap.cashCents)}, net burn ${formatDollars(snap.netBurnCentsPerMonth)}/month).`,
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
    `From ${f.method}, the range is **${range(f.runwayMonths.p10, f.runwayMonths.p90)}**` +
      (f.trendCentsPerMonth ? ` (burn ${f.trendCentsPerMonth > 0 ? "rising" : "falling"} about ${formatDollars(Math.abs(f.trendCentsPerMonth))} a month).` : ".") +
      ` It can't foresee one-off shocks like a lost customer or a big bill, and in tests it held the real outcome about 7–8 times in 10, so the low end is not a worst case.`,
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
  const lines = [`**${formatDollars(r.totalCents)}** across ${r.renewals.length} ${r.renewals.length === 1 ? "charge" : "charges"} is due in the next ${RENEWAL_DAYS} days.`];
  if (decide.length) {
    lines.push(
      "Decide on these before they renew (annual, quarterly or $5k+):",
      decide
        .slice(0, MAX_LISTED)
        .map((x) => `- **${x.vendorName}** ${x.cadence}: ${formatCents(x.amountCents)} on ${x.dueDate} (in ${x.daysAway} days)`)
        .join("\n"),
    );
  }
  if (rest > 0)
    lines.push(
      decide.length === 0
        ? `${rest === 1 ? "It's a routine bill" : "All are routine bills"}; the full list is under Coming up.`
        : `The other ${rest === 1 ? "one is a routine bill" : `${rest} are routine bills`}; the full list is under Coming up.`,
    );
  return { question: INSTANT_QUESTIONS.renewals, tools: ["get_upcoming_renewals"], text: lines.join("\n\n") };
}

function defaultAlive(a: Analysis): InstantAnswer {
  const s = runScenario(a, {});
  const growth = s.revenueGrowthMeasured;
  const need = s.growthNeededForDefaultAlivePctPerMonth;
  const trend = growth ? `Revenue has grown about ${growth} recently.` : "There isn't enough revenue history to measure growth yet, so this assumes flat revenue.";
  const lines = s.defaultAlive
    ? [
        `**Yes, default alive.** ${trend} If that holds and spend stays flat, revenue covers expenses from **month ${s.breakEvenMonth}** on, before the cash runs out.`,
        need === null ? "" : need <= 0 ? "It holds even if growth stops." : `The margin: growth needs to stay above **${need.toFixed(1)}%/month**. Below that, you'd need to raise or cut.`,
      ]
    : [
        `**No, default dead.** ${trend} With flat spend, ${s.zeroCashDate ? `cash runs out around ${formatDate(s.zeroCashDate)}` : "lasting profitability isn't reached within 5 years"} before revenue catches up with expenses.`,
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

/** Budgets for an instant answer: the list, none at all for this data source (null), or unreadable just now. */
export type InstantBudgets = readonly Budget[] | null | "unavailable";

function budgetsAnswer(a: Analysis, _dismissed: ReadonlySet<string>, budgets: InstantBudgets): InstantAnswer {
  const tools = ["get_budgets"];
  if (budgets === null) return { question: INSTANT_QUESTIONS.budgets, tools, text: "Budgets are for a signed-in company's own data; the Rho sandbox has none." };
  if (budgets === "unavailable") return { question: INSTANT_QUESTIONS.budgets, tools, text: "Couldn't load your budgets just now. Try again in a moment." };
  const { budgets: rows } = getBudgets(a, budgets);
  if (rows.length === 0)
    return { question: INSTANT_QUESTIONS.budgets, tools, text: "No budgets are set yet. Add one per category on the dashboard's **Budgets** card and Runway tracks it from the bank data." };
  const name = (c: string) => categoryName(c)[0]!.toUpperCase() + categoryName(c).slice(1);
  const over = rows.filter((r) => r.status === "over");
  const heading = rows.filter((r) => r.status === "over_pace");
  const fine = rows.filter((r) => r.status === "under");
  const lines = [`Budgets for ${formatDate(`${a.asOf.slice(0, 7)}-01`)} to ${formatDate(a.asOf)}:`];
  if (over.length) lines.push("**Over budget**", `${over.map((r) => `- ${name(r.category)}: ${formatMoney(r.monthToDateCents)} so far of ${formatMoney(r.monthlyCents)}`).join("\n")}`);
  if (heading.length)
    lines.push("**Heading over**", `${heading.map((r) => `- ${name(r.category)}: likely ${formatMoney(r.projectedCents)} of ${formatMoney(r.monthlyCents)} (${formatMoney(r.monthToDateCents)} so far)`).join("\n")}`);
  if (fine.length) lines.push(`On track: ${fine.map((r) => name(r.category)).join(", ")}.`);
  lines.push("\"Likely\" adds recurring bills still due this month and one-off spend at its pace from day 7.");
  return { question: INSTANT_QUESTIONS.budgets, tools, text: lines.join("\n\n") };
}

function burnMoved(a: Analysis): InstantAnswer {
  const tools = ["get_burn_bridge"];
  const b = getBurnBridge(a);
  if ("note" in b) return { question: INSTANT_QUESTIONS.burn_moved, tools, text: b.note };
  const month = (m: string) => formatDate(`${m}-01`).replace(/ 1, /, " ");
  const signed = (c: number) => `${c > 0 ? "+" : "−"}${formatDollars(Math.abs(c))}`;
  const head =
    b.changeCents === 0
      ? `Net burn in ${month(b.month)} was **${formatDollars(b.netBurnCents)}**, the same as ${month(b.previous)}.`
      : `${b.netBurnCents < 0 ? `In ${month(b.month)} more came in than went out: cash-flow positive by **${formatDollars(-b.netBurnCents)}**; net burn was` : `Net burn in ${month(b.month)} was **${formatDollars(b.netBurnCents)}**,`} ${b.changeCents > 0 ? "up" : "down"} **${formatDollars(Math.abs(b.changeCents))}** on ${month(b.previous)}.`;
  const rows = [
    ...b.drivers.map((d) => `- ${d.name}${d.kind === "new" ? " (new)" : d.kind === "stopped" ? " (stopped)" : ""}: ${signed(d.changeCents)}`),
    ...(b.otherCents ? [`- Everything else: ${signed(b.otherCents)}`] : []),
    ...(b.revenueChangeCents ? [`- ${b.revenueChangeCents > 0 ? "More" : "Less"} money in: ${signed(-b.revenueChangeCents)}`] : []),
  ];
  return { question: INSTANT_QUESTIONS.burn_moved, tools, text: [head, ...(rows.length ? ["What moved it (these add up to the change):", rows.join("\n")] : [])].join("\n\n") };
}

function whoSpends(a: Analysis): InstantAnswer {
  const tools = ["get_people_spend"];
  const p = getPeopleSpend(a);
  if ("note" in p) return { question: INSTANT_QUESTIONS.people, tools, text: p.note };
  const rows = p.rows.slice(0, MAX_LISTED).map(
    (r) => `- **${r.cardholder}**: ${formatDollars(r.monthlyCents)}/month (${(r.shareOfGross * 100).toFixed(1)}% of gross burn)${r.top.length ? `: ${r.top.map((v) => v.name).join(", ")}` : ""}`,
  );
  return {
    question: INSTANT_QUESTIONS.people,
    tools,
    text: [`Card spend per person, per month, after refunds (same months as burn):`, rows.join("\n"), `Payroll, rent and other spending no card names come to ${formatDollars(p.unassignedMonthlyCents)}/month.`].join("\n\n"),
  };
}

function moneyInAnswer(a: Analysis): InstantAnswer {
  const m = getMoneyIn(a);
  const tools = ["get_money_in"];
  if (!m) return { question: INSTANT_QUESTIONS.money_in, tools, text: "No money came in over the months burn averages, apart from transfers between your accounts and refunds." };
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const months = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} months` : "no end in sight");
  const top = m.topCustomer;
  return {
    question: INSTANT_QUESTIONS.money_in,
    tools,
    text: [
      `**${formatDollars(m.monthlyCents)}** a month comes in (${burnBasis(m.months)}). By who sent it:`,
      [
        ...m.payers.map((p) => `- ${p.name}: ${formatDollars(p.monthlyCents)} (${pct(p.share)})${p.processor ? ", payouts from many customers" : ""}`),
        ...(m.othersMonthlyCents > 0 ? [`- Everyone else: ${formatDollars(m.othersMonthlyCents)}`] : []),
      ].join("\n"),
      top
        ? `The biggest customer is **${top.name}** at ${pct(top.share)} of money in. If it stopped paying, runway would be **${months(top.runwayWithoutMonths)}** instead of ${months(a.snapshot.runwayMonths)}.`
        : "None of it is from a single customer (it comes through payment processors, or as interest or transfers).",
    ].join("\n\n"),
  };
}

function form1099Answer(a: Analysis): InstantAnswer {
  const prep = get1099Prep(a);
  const tools = ["get_1099_prep"];
  if (!prep) return { question: INSTANT_QUESTIONS.form_1099, tools, text: "No contractor, lawyer or landlord paid by bank is near the 1099 line in the data." };
  const over = prep.rows.filter((r) => r.overThreshold);
  const close = prep.rows.filter((r) => !r.overThreshold);
  const line = (r: (typeof prep.rows)[number]) => `- ${r.name}: ${formatDollars(r.paidCents)} (${r.form})`;
  const threshold = formatDollars(prep.thresholdCents);
  return {
    question: INSTANT_QUESTIONS.form_1099,
    tools,
    text: [
      over.length > 0
        ? `**${over.length}** ${over.length === 1 ? "payee was" : "payees were"} paid ${threshold} or more by bank in ${prep.year} and may need a 1099 from you (due Jan 31, ${prep.year + 1}):`
        : `No contractor, lawyer or landlord paid by bank has reached ${threshold} in ${prep.year} yet.`,
      over.map(line).join("\n"),
      close.length > 0 ? `Getting close:\n${close.map((r) => `- ${r.name}: ${formatDollars(r.paidCents)}`).join("\n")}` : "",
      prep.unplaced.length > 0
        ? `Paid ${threshold}+ by bank but not categorised (payroll services, taxes and loans land here too): ${prep.unplaced.map((u) => `${u.name} (${formatDollars(u.paidCents)})`).join(", ")}. If any is a contractor, set its category to Contractors and it joins the list.`
        : "",
      `Corporations usually don't need one (law firms do), so ask each payee for a W-9. Card payments are reported by the card network and aren't listed.${
        prep.partialFrom ? ` The data starts ${formatDate(prep.partialFrom)}, so earlier payments aren't counted.` : ""
      } A list to check with your accountant, not tax advice.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function committedAnswer(a: Analysis): InstantAnswer {
  const c = getCommitted(a);
  const tools = ["get_committed_spend"];
  if (c.items.length === 0) return { question: INSTANT_QUESTIONS.committed, tools, text: `No recurring charges are expected between ${formatDate(c.from)} and ${formatDate(c.until)}.` };
  const byVendor = new Map<string, { name: string; cents: number; times: number }>();
  for (const i of c.items) {
    const v = byVendor.get(i.vendorKey) ?? { name: i.vendorName, cents: 0, times: 0 };
    v.cents += i.amountCents;
    v.times += 1;
    byVendor.set(i.vendorKey, v);
  }
  const rows = [...byVendor.values()]
    .sort((x, y) => y.cents - x.cents)
    .slice(0, MAX_LISTED)
    .map((v) => `- ${v.name}: ${formatDollars(v.cents)}${v.times > 1 ? ` (${v.times} charges)` : ""}`);
  return {
    question: INSTANT_QUESTIONS.committed,
    tools,
    text: [
      `**${formatDollars(c.totalCents)}** in recurring charges is scheduled between ${formatDate(c.from)} and ${formatDate(c.until)}, ${
        c.cashAfterCents >= 0 ? `leaving **${formatDollars(c.cashAfterCents)}** of` : `**${formatDollars(-c.cashAfterCents)} more** than`
      } the cash Runway has${c.cashAsOf ? ` (as of ${formatDate(c.cashAsOf)})` : ""}. The biggest:`,
      rows.join("\n"),
      "That's a floor: one-off and usage-based spend come on top.",
    ].join("\n\n"),
  };
}

const ANSWERS: Record<InstantQuestion, (a: Analysis, dismissed: ReadonlySet<string>, budgets: InstantBudgets) => InstantAnswer> = {
  target_14: target14,
  pay_twice: payTwice,
  how_long: howLong,
  renewals,
  default_alive: defaultAlive,
  what_changed: whatChanged,
  budgets: budgetsAnswer,
  burn_moved: burnMoved,
  people: whoSpends,
  committed: committedAnswer,
  form_1099: form1099Answer,
  money_in: moneyInAnswer,
};

/** `dismissed`: finding ids the person said no to, never recommended. `budgets`: this data source's own (null: it has none at all). */
export function instantAnswer(a: Analysis, question: InstantQuestion, dismissed: ReadonlySet<string> = new Set(), budgets: InstantBudgets = []): InstantAnswer {
  return ANSWERS[question](a, dismissed, budgets);
}
