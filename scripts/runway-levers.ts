/**
 * Desk calculation (sleep-research C5 / I11): how much runway does fixing SaaS waste buy, next to
 * other common levers? Uses only existing deterministic libs on the baseline demo cohort.
 * Usage: npx tsx scripts/runway-levers.ts   (writes sleep-research/runs/runway-levers.json and .md)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { aiSpendTrend } from "../src/lib/finance/ai-spend";
import { simulateSavings } from "../src/lib/finance/runway";
import { analyze } from "../src/lib/pipeline";
import { generateDemoCompany } from "../src/lib/seed/demo-company";

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);
const NOISE = ["clean", "noisy"] as const;
const HIRE_MONTHLY_CENTS = 1_500_000;
const HIRE_DELAY_MONTHS = 3;

const gains = { waste: [] as number[], delayOneHire: [] as number[], holdAiSpendFlat: [] as number[], cut10PctDiscretionary: [] as number[] };
let wasteTop = 0;
let total = 0;
for (const noise of NOISE) {
  for (const seed of SEEDS) {
    const c = generateDemoCompany({ seed, noise });
    const a = analyze({ accounts: c.accounts, transactions: c.transactions, asOf: c.asOf });
    const burn = a.snapshot.netBurnCents;
    const waste = a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0);
    const w = simulateSavings(a.snapshot, waste).deltaMonths;
    // A one-off saving (delayed salary, avoided growth) buys months at today's burn.
    const hire = (HIRE_MONTHLY_CENTS * HIRE_DELAY_MONTHS) / burn;
    const ai = aiSpendTrend(a.txns, a.asOf, 6);
    const aiGrowth12 = ai ? Math.max(0, ai.projectedNext12MonthsCents - 12 * ai.latestMonthCents) : 0;
    const aiFlat = aiGrowth12 / burn;
    // 10% off spend that isn't payroll, rent, insurance or cloud/AI usage.
    const discretionary = a.txns
      .filter((t) => t.amountCents < 0 && t.status === "posted" && t.type !== "transfer" && !["payroll", "rent", "insurance", "transfer", "cloud", "ai_api"].includes(t.vendor.category) && a.snapshot.months.some((m) => t.postedAt.startsWith(m.month)))
      .reduce((s, t) => s - t.amountCents, 0) / a.snapshot.months.length;
    const disc = simulateSavings(a.snapshot, Math.round(discretionary * 0.1)).deltaMonths;
    gains.waste.push(w);
    gains.delayOneHire.push(hire);
    gains.holdAiSpendFlat.push(aiFlat);
    gains.cut10PctDiscretionary.push(disc);
    total += 1;
    if (w >= Math.max(hire, aiFlat, disc)) wasteTop += 1;
  }
}
const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
const md = [
  `Runway months gained per lever (median over ${total} baseline demo companies; synthetic_proxy, one company shape):`,
  "",
  "| Lever | Median months gained |",
  "|---|---|",
  `| Fix all detected SaaS waste | ${median(gains.waste).toFixed(2)} |`,
  `| Delay one $15k/month hire by 3 months | ${median(gains.delayOneHire).toFixed(2)} |`,
  `| Hold AI/LLM API spend flat for 12 months | ${median(gains.holdAiSpendFlat).toFixed(2)} |`,
  `| Cut 10% of discretionary spend (not payroll, rent, insurance, cloud/AI) | ${median(gains.cut10PctDiscretionary).toFixed(2)} |`,
  "",
  `Waste fixing is the single biggest lever in ${wasteTop}/${total} companies.`,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../sleep-research/runs/runway-levers.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), gains, wasteTop, total }, null, 2)}\n`);
writeFileSync(new URL("../sleep-research/runs/runway-levers.md", import.meta.url), `${md}\n`);
