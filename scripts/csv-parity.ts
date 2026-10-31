/**
 * CSV grader parity (sleep-research pilot I15): does a bank CSV export give the same findings and runway
 * as the live API path? Exports each generated company in several layouts, re-imports, compares.
 * Usage: npx tsx scripts/csv-parity.ts   (writes sleep-research/runs/csv-parity.json and .md)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { importCsv } from "../src/lib/csv/import";
import { scoreFindings } from "../src/lib/eval/score";
import { analyze } from "../src/lib/pipeline";
import { cashBalanceCents } from "../src/lib/rho/map";
import type { RhoAccount, RhoTransaction } from "../src/lib/rho/schema";
import { generateDemoCompany } from "../src/lib/seed/demo-company";
import type { FindingKind } from "../src/lib/types";

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);
const NOISE = ["clean", "noisy"] as const;
const KINDS: FindingKind[] = ["duplicate_tools", "price_creep", "zombie", "duplicate_charge"];
const LAYOUTS = ["rho_csv", "mercury_csv", "generic_all_accounts", "generic_checking_only"] as const;

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
const dateOf = (t: RhoTransaction) => (t.posted_at ?? t.initiated_at).slice(0, 10);
const usDate = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;
const dollars = (c: number) => (c / 100).toFixed(2);

function exportCsv(rows: readonly RhoTransaction[], layout: (typeof LAYOUTS)[number]): string {
  const settled = rows.filter((t) => t.status === "settled");
  if (layout === "rho_csv") {
    return ["Date,Description,Amount,Type,Account,Cardholder", ...settled.map((t) => [dateOf(t), t.counterparty_name, dollars(t.amount.amount), t.transaction_type, t.account_id, t.user_full_name ?? ""].map(q).join(","))].join("\n");
  }
  if (layout === "mercury_csv") {
    return ["Date (UTC),Description,Amount,Status,Source Account,Name On Card", ...settled.map((t) => [usDate(dateOf(t)), t.counterparty_name, dollars(t.amount.amount), "Sent", t.account_id, t.user_full_name ?? ""].map(q).join(","))].join("\n");
  }
  const scoped = layout === "generic_checking_only" ? settled.filter((t) => t.account_type === "checking") : settled;
  return ["date,description,amount", ...scoped.map((t) => [dateOf(t), t.counterparty_name, dollars(t.amount.amount)].map(q).join(","))].join("\n");
}

type Tally = { tp: number; fp: number; fn: number };
const out: Record<string, { byKind: Record<FindingKind, Tally>; runwayDelta: number[]; burnDeltaPct: number[]; skipped: number }> = {};
for (const layout of LAYOUTS) out[layout] = { byKind: Object.fromEntries(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }])) as Record<FindingKind, Tally>, runwayDelta: [], burnDeltaPct: [], skipped: 0 };

for (const noise of NOISE) {
  for (const seed of SEEDS) {
    const c = generateDemoCompany({ seed, noise });
    const api = analyze({ accounts: c.accounts, transactions: c.transactions, asOf: c.asOf });
    // The grader asks for today's total cash (a CSV has no balance); give it the true figure.
    const accounts: RhoAccount[] = [{ id: "upload", account_type: "checking", account_name: "Upload", balance: { amount: cashBalanceCents(c.accounts), currency: "USD" } }];
    for (const layout of LAYOUTS) {
      const imported = importCsv(exportCsv(c.transactions, layout), { accountId: "upload" });
      const a = analyze({ accounts, transactions: imported.transactions, asOf: c.asOf });
      const s = scoreFindings(a.findings, c.truth);
      for (const k of s.byKind) {
        out[layout]!.byKind[k.kind].tp += k.truePositives;
        out[layout]!.byKind[k.kind].fp += k.falsePositives;
        out[layout]!.byKind[k.kind].fn += k.falseNegatives;
      }
      out[layout]!.runwayDelta.push(Math.abs(a.snapshot.runwayMonths - api.snapshot.runwayMonths));
      out[layout]!.burnDeltaPct.push((a.snapshot.netBurnCents - api.snapshot.netBurnCents) / api.snapshot.netBurnCents);
      out[layout]!.skipped += imported.skipped.length;
    }
  }
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const fmt = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const max = (xs: number[]) => Math.max(...xs);
const rows = LAYOUTS.map((l) => {
  const r = out[l]!;
  return `| ${l} | ${KINDS.map((k) => `${fmt(ratio(r.byKind[k].tp, r.byKind[k].tp + r.byKind[k].fp))} / ${fmt(ratio(r.byKind[k].tp, r.byKind[k].tp + r.byKind[k].fn))}`).join(" | ")} | ${median(r.runwayDelta).toFixed(2)} / ${max(r.runwayDelta).toFixed(2)} | ${(median(r.burnDeltaPct) * 100).toFixed(1)}% | ${r.skipped} |`;
});
const md = [
  `CSV vs API parity: ${SEEDS.length} seeds × ${NOISE.length} noise levels. Detector cells are precision / recall vs planted truth; runway delta is |CSV − API| in months (median / max); burn delta is the median signed difference in net burn.`,
  "",
  `| Layout | ${KINDS.join(" | ")} | Runway Δ mo (median / max) | Net burn Δ | Rows skipped |`,
  `|---|${KINDS.map(() => "---").join("|")}|---|---|---|`,
  ...rows,
].join("\n");
console.log(md);
mkdirSync(new URL("../sleep-research/runs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../sleep-research/runs/csv-parity.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), seeds: SEEDS, noise: NOISE, results: out }, null, 2)}\n`);
writeFileSync(new URL("../sleep-research/runs/csv-parity.md", import.meta.url), `${md}\n`);
