/**
 * Portfolio triage pilot (sleep-research I1): rank 30 startups at a cutoff date and check which ones
 * actually fell under 6 months of runway three months later. Trouble comes from revenue drops that
 * start just before the cutoff; distractors are a big one-off bill and a seasonal revenue dip.
 * Usage: npx tsx scripts/portfolio-triage.ts   (writes sleep-research/runs/portfolio-triage.json and .md)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { addDays } from "../src/lib/dates";
import { forecastCash } from "../src/lib/finance/forecast";
import { monthlyHistory } from "../src/lib/finance/history";
import { analyze, type Analysis } from "../src/lib/pipeline";
import { cashBalanceCents } from "../src/lib/rho/map";
import type { RhoAccount, RhoTransaction } from "../src/lib/rho/schema";
import { generateDemoCompany } from "../src/lib/seed/demo-company";
import { createRng } from "../src/lib/seed/rng";

const PORTFOLIOS = 30;
const COMPANIES = 30;
const TOP_K = 5;
const TROUBLE_MONTHS = 6;
const ASOF = "2026-10-26";
const CUTOFF = addDays(ASOF, -91);
const RUN_RATE_DAYS = 30;
const ONE_OFF_MIN_CENTS = 1_000_000;

type Profile = "normal" | "revenue_drop" | "one_off_bill" | "seasonal_dip";
const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const isStripe = (t: RhoTransaction) => t.counterparty_name.includes("STRIPE") && t.amount.amount > 0;

/** Build one company: scaled cash plus a profile event. Balances are "today" (ASOF), consistent with the flows. */
function company(seed: number, profile: Profile, cashScale: number, rng: ReturnType<typeof createRng>) {
  const base = generateDemoCompany({ seed, asOf: ASOF });
  let delta = 0;
  let txns = base.transactions.map((t) => {
    if (!isStripe(t)) return t;
    const d = dateOf(t);
    let factor = 1;
    if (profile === "revenue_drop" && d >= addDays(CUTOFF, -20)) factor = 1 - (0.5 + rng.next() * 0.3);
    if (profile === "seasonal_dip" && d > addDays(CUTOFF, -30) && d <= CUTOFF) factor = 0.5;
    const amount = Math.round(t.amount.amount * factor);
    delta += amount - t.amount.amount;
    return { ...t, amount: { ...t.amount, amount } };
  });
  if (profile === "one_off_bill") {
    const amount = -(5_000_000 + rng.int(0, 3_000_000));
    delta += amount;
    const d = addDays(CUTOFF, -12);
    txns = [...txns, { ...txns[0]!, id: `oneoff_${seed}`, money_movement_id: null, account_id: "acc_taco_checking", account_type: "checking", transaction_type: "ach_debit", counterparty_name: "WILSON SONSINI LEGAL", amount: { amount, currency: "USD" }, initiated_at: `${d}T15:00:00Z`, posted_at: `${d}T18:00:00Z`, card_id: null, card_name: null, user_full_name: null }];
  }
  const checking = base.accounts.find((a) => a.account_type === "checking")!;
  const accounts: RhoAccount[] = base.accounts.map((a) =>
    a.account_type === "credit" ? a : { ...a, balance: { ...a.balance, amount: Math.round(a.balance.amount * cashScale) + (a.id === checking.id ? delta : 0) } },
  );
  return { accounts, txns };
}

/** What a monitor could see at the cutoff: transactions up to it, and the cash balance then. */
function atCutoff(accounts: RhoAccount[], txns: RhoTransaction[]): Analysis {
  const cashNow = cashBalanceCents(accounts);
  const later = txns.filter((t) => dateOf(t) > CUTOFF && t.status === "settled" && t.account_type !== "credit").reduce((s, t) => s + t.amount.amount, 0);
  const visible = txns.filter((t) => dateOf(t) <= CUTOFF);
  return analyze({ accounts: [{ id: "cash", account_type: "checking", account_name: "Cash", balance: { amount: cashNow - later, currency: "USD" } }], transactions: visible, asOf: CUTOFF });
}

/** Lower = riskier. Baseline: trailing runway. */
const trailing = (a: Analysis) => a.snapshot.runwayMonths;

/** Lower = riskier. min(P10 runway, run-rate runway over the last 30 days, ignoring big non-recurring one-offs). */
function composite(a: Analysis): number {
  const f = forecastCash({ cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, 12), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf });
  const recurring = new Set(a.streams.flatMap((s) => s.txnIds));
  const since = addDays(a.asOf, -RUN_RATE_DAYS);
  let net = 0;
  for (const t of a.txns) {
    if (t.postedAt <= since || t.status !== "posted" || t.type === "transfer" || t.vendor.category === "transfer") continue;
    if (t.amountCents < 0 && -t.amountCents >= ONE_OFF_MIN_CENTS && !recurring.has(t.id) && t.vendor.category !== "payroll") continue;
    net -= t.amountCents;
  }
  const runRate = net > 0 ? a.snapshot.cashCents / net : Number.POSITIVE_INFINITY;
  return Math.min(f.runwayMonths.p10, runRate);
}

interface PortfolioResult {
  troubled: number;
  /** Early warning: among companies still at ≥ 6 months at the cutoff, how many of those that cross are in the top 5. */
  crossers: number;
  earlyTrailing: number;
  earlyComposite: number;
  recallTrailing: number;
  recallComposite: number;
  distractorsTrailing: number;
  distractorsComposite: number;
}
const results: PortfolioResult[] = [];
for (let p = 0; p < PORTFOLIOS; p++) {
  const rng = createRng(1000 + p);
  const rows = Array.from({ length: COMPANIES }, (_, i) => {
    const profile: Profile = i < 6 ? "revenue_drop" : i < 11 ? "one_off_bill" : i < 16 ? "seasonal_dip" : "normal";
    const { accounts, txns } = company(p * 100 + i + 1, profile, 0.35 + rng.next() * 0.75, rng);
    const truth = analyze({ accounts, transactions: txns, asOf: ASOF });
    const seen = atCutoff(accounts, txns);
    return { profile, troubled: truth.snapshot.runwayMonths < TROUBLE_MONTHS, trailing: trailing(seen), composite: composite(seen) };
  });
  const troubled = rows.filter((r) => r.troubled);
  const top = (key: "trailing" | "composite") => [...rows].sort((a, b) => a[key] - b[key]).slice(0, TOP_K);
  const recall = (key: "trailing" | "composite") => (troubled.length ? top(key).filter((r) => r.troubled).length / Math.min(TOP_K, troubled.length) : 1);
  const distractors = (key: "trailing" | "composite") => top(key).filter((r) => !r.troubled && (r.profile === "one_off_bill" || r.profile === "seasonal_dip")).length;
  const pending = rows.filter((r) => r.trailing >= TROUBLE_MONTHS);
  const crossers = pending.filter((r) => r.troubled);
  const early = (key: "trailing" | "composite") =>
    crossers.length ? [...pending].sort((a, b) => a[key] - b[key]).slice(0, TOP_K).filter((r) => r.troubled).length / Math.min(TOP_K, crossers.length) : null;
  results.push({ crossers: crossers.length, earlyTrailing: early("trailing") ?? Number.NaN, earlyComposite: early("composite") ?? Number.NaN, troubled: troubled.length, recallTrailing: recall("trailing"), recallComposite: recall("composite"), distractorsTrailing: distractors("trailing"), distractorsComposite: distractors("composite") });
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const summary = {
  portfolios: PORTFOLIOS,
  companiesPerPortfolio: COMPANIES,
  meanTroubledPerPortfolio: mean(results.map((r) => r.troubled)),
  recallAt5: { trailing: mean(results.map((r) => r.recallTrailing)), composite: mean(results.map((r) => r.recallComposite)) },
  meanDistractorsInTop5: { trailing: mean(results.map((r) => r.distractorsTrailing)), composite: mean(results.map((r) => r.distractorsComposite)) },
  // Pre-declared before running: composite must beat trailing by ≥ 15 points on this metric.
  earlyWarningRecallAt5: {
    portfoliosWithCrossers: results.filter((r) => r.crossers > 0).length,
    meanCrossers: mean(results.map((r) => r.crossers)),
    trailing: mean(results.filter((r) => r.crossers > 0).map((r) => r.earlyTrailing)),
    composite: mean(results.filter((r) => r.crossers > 0).map((r) => r.earlyComposite)),
  },
  portfoliosWithAtMostOneDistractor: { trailing: results.filter((r) => r.distractorsTrailing <= 1).length, composite: results.filter((r) => r.distractorsComposite <= 1).length },
};
const md = [
  `Portfolio triage: ${PORTFOLIOS} portfolios × ${COMPANIES} companies; ranked at ${CUTOFF}, truth = trailing runway under ${TROUBLE_MONTHS} months at ${ASOF}.`,
  `Mix per portfolio: 6 revenue drops (start 20 days before cutoff), 5 one-off bills, 5 seasonal dips, 14 normal; cash scaled 0.35–1.10×.`,
  "",
  "| Ranking | Recall@5 (troubled companies in the top 5) | Distractors in top 5 (mean) | Portfolios with ≤ 1 distractor |",
  "|---|---|---|---|",
  `| Trailing runway (baseline) | ${(summary.recallAt5.trailing * 100).toFixed(1)}% | ${summary.meanDistractorsInTop5.trailing.toFixed(2)} | ${summary.portfoliosWithAtMostOneDistractor.trailing}/${PORTFOLIOS} |`,
  `| Composite (P10 runway, 30-day run rate excl. big one-offs) | ${(summary.recallAt5.composite * 100).toFixed(1)}% | ${summary.meanDistractorsInTop5.composite.toFixed(2)} | ${summary.portfoliosWithAtMostOneDistractor.composite}/${PORTFOLIOS} |`,
  "",
  `Mean troubled companies per portfolio: ${summary.meanTroubledPerPortfolio.toFixed(1)}.`,
  "",
  `Early warning (pre-declared; bar: composite ≥ trailing + 15 points). Among companies still at ≥ ${TROUBLE_MONTHS} months at the cutoff, recall@${TOP_K} of those that fall under ${TROUBLE_MONTHS} by ${ASOF}:`,
  `- Trailing runway: ${(summary.earlyWarningRecallAt5.trailing * 100).toFixed(1)}%; composite: ${(summary.earlyWarningRecallAt5.composite * 100).toFixed(1)}% (${summary.earlyWarningRecallAt5.portfoliosWithCrossers} portfolios with crossers, mean ${summary.earlyWarningRecallAt5.meanCrossers.toFixed(1)} crossers each).`,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../sleep-research/runs/portfolio-triage.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`);
writeFileSync(new URL("../sleep-research/runs/portfolio-triage.md", import.meta.url), `${md}\n`);
