/**
 * Held-out stress evaluation for claim C1 (sleep-research): the frozen variants in src/lib/eval/heldout.ts,
 * written blind to the detector code. Reports precision/recall per detector per variant.
 * Usage: npx tsx scripts/heldout-eval.ts <label>   (writes sleep-research/runs/heldout-<label>.json and .md)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { HELD_OUT } from "../src/lib/eval/heldout";
import { scoreFindings } from "../src/lib/eval/score";
import { analyze } from "../src/lib/pipeline";
import { generateDemoCompany } from "../src/lib/seed/demo-company";
import type { FindingKind } from "../src/lib/types";

const label = process.argv[2] ?? "run";
const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);
const NOISE = ["clean", "noisy"] as const;
const KINDS: FindingKind[] = ["duplicate_tools", "price_creep", "zombie", "duplicate_charge"];
type Tally = { tp: number; fp: number; fn: number };

const rows: string[] = [];
const json: Record<string, unknown> = {};
for (const h of HELD_OUT) {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }])) as Record<FindingKind, Tally>;
  const examples = new Set<string>();
  // Dollar accuracy (audit follow-up): for findings that match a planted item, is the amount within 10% of truth?
  let matched = 0;
  let amountOk = 0;
  for (const noise of NOISE) {
    for (const seed of SEEDS) {
      const c = h.apply(generateDemoCompany({ seed, noise }), seed);
      const a = analyze({ accounts: c.accounts, transactions: c.transactions, asOf: c.asOf });
      const s = scoreFindings(a.findings, c.truth);
      for (const k of s.byKind) {
        byKind[k.kind].tp += k.truePositives;
        byKind[k.kind].fp += k.falsePositives;
        byKind[k.kind].fn += k.falseNegatives;
      }
      const key = (kind: string, keys: readonly string[]) => `${kind}|${[...keys].sort().join(",")}`;
      const truthAmount = new Map(c.truth.map((w) => [key(w.kind, w.vendorKeys), w.monthlyCents + w.oneTimeCents]));
      for (const f of a.findings) {
        const want = truthAmount.get(key(f.kind, f.vendorKeys));
        if (want === undefined) continue;
        matched += 1;
        const got = f.monthlySavingsCents + f.oneTimeCents;
        if (Math.abs(got - want) <= 0.1 * want) amountOk += 1;
        else examples.add(`$ ${f.kind} ${f.vendorKeys.join(",")}: found ${got} vs truth ${want} cents`);
      }
      for (const u of s.unexpected) examples.add(`FP ${u.kind}: ${u.title}`);
      for (const m of s.missed) examples.add(`MISS ${m.kind}: ${m.note}`);
    }
  }
  const cell = (t: Tally) => `${t.tp + t.fp === 0 ? "n/a" : `${Math.round((t.tp / (t.tp + t.fp)) * 100)}%`} / ${t.tp + t.fn === 0 ? "n/a" : `${Math.round((t.tp / (t.tp + t.fn)) * 100)}%`}`;
  const dollars = matched ? `${Math.round((amountOk / matched) * 100)}%` : "n/a";
  rows.push(`| ${h.name} | ${h.failureMode} | ${KINDS.map((k) => cell(byKind[k])).join(" | ")} | ${dollars} |`);
  json[h.name] = { failureMode: h.failureMode, expectation: h.expectation, byKind, matched, amountWithin10Pct: amountOk, examples: [...examples].slice(0, 5) };
}
const md = [
  `Held-out stress set (${label}): ${SEEDS.length} seeds × ${NOISE.length} noise levels per variant. Cells are precision / recall per detector.`,
  "",
  `| Variant | Failure mode | ${KINDS.join(" | ")} | $ within 10% of truth |`,
  `|---|---|${KINDS.map(() => "---").join("|")}|---|`,
  ...rows,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../sleep-research/runs/heldout-${label}.json`, import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), results: json }, null, 2)}\n`);
writeFileSync(new URL(`../sleep-research/runs/heldout-${label}.md`, import.meta.url), `${md}\n`);
