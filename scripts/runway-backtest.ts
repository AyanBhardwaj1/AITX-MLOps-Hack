/**
 * Honest backtest of the existing cash forecast (sleep-research C6): at past origins, forecast with only
 * the data available then, and check whether the P10-P90 band contained the cash that actually followed.
 * Usage: npx tsx scripts/runway-backtest.ts   (writes sleep-research/runs/runway-backtest.json and .md)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { addDays, AVG_DAYS_PER_MONTH } from "../src/lib/dates";
import { forecastCash } from "../src/lib/finance/forecast";
import { monthlyHistory } from "../src/lib/finance/history";
import { analyze } from "../src/lib/pipeline";
import { cashBalanceCents } from "../src/lib/rho/map";
import type { RhoTransaction } from "../src/lib/rho/schema";
import { generateDemoCompany } from "../src/lib/seed/demo-company";

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);
const NOISE = ["clean", "noisy"] as const;
const ASOF = "2026-10-26";
const ORIGIN_MONTHS_BACK = [6, 7, 8, 9, 10];
const HORIZONS = [3, 6];
const PROFILES = ["as_generated", "hiring_ramp", "revenue_drop", "one_off_bill"] as const;

const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const cashFlowAfter = (txns: readonly RhoTransaction[], d: string) =>
  txns.filter((t) => dateOf(t) > d && t.status === "settled" && t.account_type !== "credit").reduce((s, t) => s + t.amount.amount, 0);

/** Payroll grows $8k/month every two months for the last 16 months: a visible, continuing trend. Today's balance absorbs the extra spend. */
function hiringRamp(txns: RhoTransaction[]): { txns: RhoTransaction[]; extra: number } {
  let extra = 0;
  const start = addDays(ASOF, -16 * 30);
  const out = txns.map((t) => {
    const d = dateOf(t);
    if (!t.counterparty_name.includes("GUSTO") || d < start) return t;
    const steps = Math.floor((Date.parse(d) - Date.parse(start)) / (60 * 86_400_000)) + 1;
    const add = -steps * 400_000; // half of $8k per semimonthly run
    extra += add;
    return { ...t, amount: { ...t.amount, amount: t.amount.amount + add } };
  });
  return { txns: out, extra };
}

/** Revenue falls 50% from 5 months before ASOF: an event no history-based band can foresee. */
function revenueDrop(txns: RhoTransaction[]): { txns: RhoTransaction[]; extra: number } {
  let extra = 0;
  const from = addDays(ASOF, -150);
  const out = txns.map((t) => {
    if (!t.counterparty_name.includes("STRIPE") || t.amount.amount <= 0 || dateOf(t) < from) return t;
    const cut = -Math.round(t.amount.amount / 2);
    extra += cut;
    return { ...t, amount: { ...t.amount, amount: t.amount.amount + cut } };
  });
  return { txns: out, extra };
}

/** A $60k one-off legal bill 4 months before ASOF. */
function oneOffBill(txns: RhoTransaction[]): { txns: RhoTransaction[]; extra: number } {
  const d = addDays(ASOF, -120);
  const bill = { ...txns[0]!, id: "oneoff_backtest", money_movement_id: null, account_id: "acc_taco_checking", account_type: "checking" as const, transaction_type: "ach_debit", counterparty_name: "WILSON SONSINI LEGAL", amount: { amount: -6_000_000, currency: "USD" }, initiated_at: `${d}T15:00:00Z`, posted_at: `${d}T18:00:00Z`, card_id: null, card_name: null, user_full_name: null };
  return { txns: [...txns, bill], extra: -6_000_000 };
}

const results: Record<string, Record<number, { inBand: number; below: number; above: number; n: number; widthPct: number[] }>> = {};
for (const profile of PROFILES) {
  results[profile] = Object.fromEntries(HORIZONS.map((h) => [h, { inBand: 0, below: 0, above: 0, n: 0, widthPct: [] as number[] }]));
  for (const noise of NOISE) {
    for (const seed of SEEDS) {
      const base = generateDemoCompany({ seed, noise, asOf: ASOF });
      const { txns, extra } =
        profile === "hiring_ramp" ? hiringRamp(base.transactions) : profile === "revenue_drop" ? revenueDrop(base.transactions) : profile === "one_off_bill" ? oneOffBill(base.transactions) : { txns: base.transactions, extra: 0 };
      // Keep the company solvent: shift today's cash by the extra spend so past balances stay as generated.
      const cashNow = cashBalanceCents(base.accounts) + extra;
      for (const back of ORIGIN_MONTHS_BACK) {
        const origin = addDays(ASOF, -Math.round(back * AVG_DAYS_PER_MONTH));
        const cashAtOrigin = cashNow - cashFlowAfter(txns, origin);
        const a = analyze({ accounts: [{ id: "c", account_type: "checking", account_name: "c", balance: { amount: cashAtOrigin, currency: "USD" } }], transactions: txns.filter((t) => dateOf(t) <= origin), asOf: origin });
        const f = forecastCash({ cashCents: cashAtOrigin, history: monthlyHistory(a.txns, origin, 12), netBurnCents: a.snapshot.netBurnCents, asOf: origin, horizonMonths: Math.max(...HORIZONS) + 1 });
        for (const h of HORIZONS) {
          if (h > back) continue;
          const point = f.points.find((p) => p.monthsAhead === h);
          if (!point) continue;
          const realized = cashNow - cashFlowAfter(txns, addDays(origin, Math.round(h * AVG_DAYS_PER_MONTH)));
          const r = results[profile]![h]!;
          r.n += 1;
          if (realized < point.p10Cents) r.below += 1;
          else if (realized > point.p90Cents) r.above += 1;
          else r.inBand += 1;
          r.widthPct.push((point.p90Cents - point.p10Cents) / Math.max(1, point.p50Cents));
        }
      }
    }
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const lines = PROFILES.flatMap((p) =>
  HORIZONS.map((h) => {
    const r = results[p]![h]!;
    return `| ${p} | ${h} mo | ${r.n} | ${((r.inBand / r.n) * 100).toFixed(0)}% | ${((r.below / r.n) * 100).toFixed(0)}% | ${((r.above / r.n) * 100).toFixed(0)}% | ${(median(r.widthPct) * 100).toFixed(1)}% |`;
  }),
);
const md = [
  `Backtest of the P10-P90 cash band: ${SEEDS.length} seeds × ${NOISE.length} noise levels × origins ${ORIGIN_MONTHS_BACK.join("/")} months before ${ASOF}. A well-calibrated 80% band contains realized cash about 80% of the time.`,
  "",
  "| Profile | Horizon | Forecasts | Inside band | Below P10 (worse than feared) | Above P90 | Median band width (% of P50) |",
  "|---|---|---|---|---|---|---|",
  ...lines,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../sleep-research/runs/runway-backtest.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
writeFileSync(new URL("../sleep-research/runs/runway-backtest.md", import.meta.url), `${md}\n`);
