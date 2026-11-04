/**
 * Honest backtest of the existing cash forecast (sleep-research C6): at past origins, forecast with only
 * the data available then, and check whether the P10-P90 band contained the cash that actually followed.
 * Usage: npx tsx scripts/runway-backtest.ts [--method trend|swings] [--damping 0.9] [--window 6] [--scale 1] [--seeds dev|holdout|holdout2|holdout3]
 *   Defaults reproduce the original run (swings, dev seeds) and write sleep-research/runs/runway-backtest.{json,md};
 *   other settings write runway-backtest-<method>-<damping>-<seeds>.{json,md}.
 *   Dev seeds are for choosing settings; held-out seeds are run once to confirm them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { addDays, AVG_DAYS_PER_MONTH } from "../src/lib/dates";
import { forecastCash, type ForecastMethod } from "../src/lib/finance/forecast";
import { monthlyHistory } from "../src/lib/finance/history";
import { analyze } from "../src/lib/pipeline";
import { cashBalanceCents } from "../src/lib/rho/map";
import type { RhoTransaction } from "../src/lib/rho/schema";
import { generateDemoCompany } from "../src/lib/seed/demo-company";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const METHOD = (arg("method") ?? "swings") as ForecastMethod;
const DAMPING = Number(arg("damping") ?? 0.9);
const WINDOW = Number(arg("window") ?? 6);
const SCALE = Number(arg("scale") ?? 1);
const SEED_SET = arg("seeds") ?? "dev";
const SEED_OFFSET: Record<string, number> = { dev: 0, holdout: 20, holdout2: 40, holdout3: 60 };
if (!["trend", "swings"].includes(METHOD) || !(SEED_SET in SEED_OFFSET) || !(DAMPING > 0 && DAMPING <= 1) || !(WINDOW >= 4 && WINDOW <= 12) || !(SCALE > 0 && SCALE <= 10)) {
  throw new Error("usage: --method trend|swings --damping (0,1] --window 4..12 --scale (0,10] --seeds dev|holdout|holdout2|holdout3");
}
// Held-out seeds never overlap the development ones.
const SEEDS = Array.from({ length: 20 }, (_, i) => (i + SEED_OFFSET[SEED_SET]!) * 37 + 1);
const ORIGINAL = METHOD === "swings" && SEED_SET === "dev";
const OUT = ORIGINAL ? "runway-backtest" : `runway-backtest-${METHOD}${METHOD === "trend" ? `-d${DAMPING}-w${WINDOW}${SCALE === 1 ? "" : `-s${SCALE}`}` : ""}-${SEED_SET}`;
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
        const f = forecastCash({ cashCents: cashAtOrigin, history: monthlyHistory(a.txns, origin, 12), netBurnCents: a.snapshot.netBurnCents, asOf: origin, horizonMonths: Math.max(...HORIZONS) + 1, method: METHOD, trendDamping: DAMPING, trendWindowMonths: WINDOW, uncertaintyScale: SCALE });
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
  `Backtest of the P10-P90 cash band (method: ${METHOD}${METHOD === "trend" ? `, damping ${DAMPING}, window ${WINDOW} months, uncertainty ×${SCALE}` : ""}; ${SEED_SET} seeds): ${SEEDS.length} seeds × ${NOISE.length} noise levels × origins ${ORIGIN_MONTHS_BACK.join("/")} months before ${ASOF}. A well-calibrated 80% band contains realized cash about 80% of the time.`,
  "",
  "| Profile | Horizon | Forecasts | Inside band | Below P10 (worse than feared) | Above P90 | Median band width (% of P50) |",
  "|---|---|---|---|---|---|---|",
  ...lines,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../sleep-research/runs/${OUT}.json`, import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), method: METHOD, damping: DAMPING, window: WINDOW, scale: SCALE, seeds: SEED_SET, results }, null, 2)}\n`);
writeFileSync(new URL(`../sleep-research/runs/${OUT}.md`, import.meta.url), `${md}\n`);
