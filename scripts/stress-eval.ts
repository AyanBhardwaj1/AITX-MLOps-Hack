/**
 * Stress test: score the detectors on ledger shapes they were not tuned for (src/lib/eval/perturb.ts).
 * Usage: npm run stress-eval   (writes sleep-research/runs/stress-eval.json and prints a table)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PERTURBATIONS, perturb, type Perturbation } from "../src/lib/eval/perturb";
import { scoreFindings } from "../src/lib/eval/score";
import { analyze } from "../src/lib/pipeline";
import { generateDemoCompany } from "../src/lib/seed/demo-company";
import type { FindingKind } from "../src/lib/types";

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);
const NOISE = ["clean", "noisy"] as const;
const KINDS: FindingKind[] = ["duplicate_tools", "price_creep", "zombie", "duplicate_charge"];
const SETTINGS: ("baseline" | Perturbation)[] = ["baseline", ...PERTURBATIONS, "combined"];

interface Tally {
  tp: number;
  fp: number;
  fn: number;
}
const results: Record<string, { runs: number; byKind: Record<FindingKind, Tally>; dollarRecall: number[]; examples: string[] }> = {};

for (const setting of SETTINGS) {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }])) as Record<FindingKind, Tally>;
  const dollarRecall: number[] = [];
  const examples = new Set<string>();
  let runs = 0;
  for (const noise of NOISE) {
    for (const seed of SEEDS) {
      const base = generateDemoCompany({ seed, noise });
      const company = setting === "baseline" ? base : perturb(base, setting, seed);
      const a = analyze({ accounts: company.accounts, transactions: company.transactions, asOf: company.asOf });
      const s = scoreFindings(a.findings, company.truth);
      for (const k of s.byKind) {
        byKind[k.kind].tp += k.truePositives;
        byKind[k.kind].fp += k.falsePositives;
        byKind[k.kind].fn += k.falseNegatives;
      }
      dollarRecall.push(s.dollarRecall);
      for (const u of s.unexpected) examples.add(`FP ${u.kind}: ${u.title}`);
      for (const m of s.missed) examples.add(`MISS ${m.kind}: ${m.note}`);
      runs += 1;
    }
  }
  results[setting] = { runs, byKind, dollarRecall, examples: [...examples].slice(0, 6) };
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const fmt = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

const table = SETTINGS.map((setting) => {
  const r = results[setting]!;
  const cells = KINDS.map((k) => {
    const t = r.byKind[k];
    return `${fmt(ratio(t.tp, t.tp + t.fp))} / ${fmt(ratio(t.tp, t.tp + t.fn))}`;
  });
  return `| ${setting} | ${r.runs} | ${cells.join(" | ")} | ${fmt(mean(r.dollarRecall))} |`;
});
const out = [
  `Detector stress test: ${SEEDS.length} seeds × ${NOISE.length} noise levels per setting. Cells are precision / recall per detector (n/a = nothing planted and nothing found).`,
  "",
  `| Setting | Runs | ${KINDS.join(" | ")} | $ recall |`,
  `|---|---|${KINDS.map(() => "---").join("|")}|---|`,
  ...table,
].join("\n");
console.log(out);
for (const setting of SETTINGS) {
  const ex = results[setting]!.examples;
  if (ex.length) console.log(`\n${setting}:\n  ${ex.join("\n  ")}`);
}

mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../sleep-research/runs/stress-eval.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), seeds: SEEDS, noise: NOISE, results }, null, 2)}\n`);
writeFileSync(new URL("../sleep-research/runs/stress-eval.md", import.meta.url), `${out}\n`);
