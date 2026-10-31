# Claims (after the claims judge)

Judge trace: `traces/claims/round1.md` (fresh same-family subagent, provisional). Every cited number was mechanically checked against its result file and reproduced by the judge on current code. Evaluation types:
- synthetic_proxy: C1, C2 part 1, C6
- self_supervised_proxy: C2 part 2
- simulation_only: C5
- direct observation with N = 1, plus a static check: C3

Scope for everything: **one generated company shape** (Taco Robotics), 20 seeds × 2 descriptor-noise levels unless stated. Not real ledgers.

| Claim | Supported | Confidence |
|---|---|---|
| C1 detector fixes on held-out shapes | partial | medium |
| C2 CSV grader parity | partial (runway: yes) | high for runway, medium for agreement |
| C3 grader makes no network requests | yes, as narrowed | high |
| C4 no evidence-free "verified" savings (tested cases) | yes | high |
| C5 SaaS waste vs other levers | yes, as illustration | high for the numbers, low beyond one shape |
| C6 forecast band miscalibrated | partial | high (shock wording fixed) |

## C1 (narrowed)

After the fixes, all 15 held-out variants score 100% precision and recall wherever something was planted or found (`runs/heldout-after-fixes.md`, `runs/heldout-after-review1.md`).

Before the fixes (`runs/heldout-before-fixes.md`):
- price increase: 36–50% precision on **3 of 6** usage variants;
- double charge: 4–15% precision on **3 of 5** split-workspace variants, and 0% on the full-refund variants;
- idle card: 0% recall when a second workspace sits on the idle card.

The other variants were already at 100% before the fixes.

Dollar accuracy: the share of matched findings within 10% of truth is 100% on 13 variants, 85% on `usage_mild` (savings use the typical past charge, not the latest) and 92% on the noisy Datadog step (where the step size can be off by about a third).

**Not supported by the data:**
- **The held-out set is not a blind test of the current code.** The same agent wrote the spec and the fixes, and "written blind" / "run once" are not evidenced (audit). A review-round-1 staircase attempt was rejected after it scored 85% on a held-out variant.
- **Small N:** 15 variants are about 15 single planted cases per seed.
- **The per-fix ablation was not run.**
- **Shapes outside the set still fail** (review round 2): flat-then-growth bills and seat additions after a flat year read as "bill up"; three raises are missed; double charges about 3 or 12 months apart are hidden.

## C2 (narrowed)

Given a correctly typed cash balance, the CSV grader reproduces the rules-only API runway within 0.05 months (median 0.00, max 0.048) for all 7 tested layouts on the **unperturbed** generated ledger, clean and noisy (`runs/csv-parity.md`, part 1). On perturbed ledgers the checking-only layouts reach 0.17 months.

Layouts with the card's own rows find exactly the API's findings:
- Rho/Mercury-style single file;
- checking + card files;
- one account in two date ranges.

Part 2 is a **consistency check**, not accuracy against truth: the same engine is compared with itself across export formats. On 27 perturbed settings × 10 seeds (clean descriptors), Rho/Mercury-style exports agree with the API, largely by construction. Generic layouts agree once idle-card findings are excluded.

The named-debit probe originally produced 2 false idle-card findings in 40 runs. That was a harness artifact (rent ACH rows renamed as card purchases); the probe now adds realistic named debit purchases and shows none.

**Not supported by the data:**
- **No real exports:** the Rho/Mercury layouts are our assumptions, untested on real exports.
- **No LLM labels:** the grader uses no LLM vendor labels, unlike the connected product.
- **Checking-only exports** see no card waste (stated in the UI).

## C3

In one Playwright session on the current build (`d461116` plus parity-probe edits), uploading a Mercury-style file and grading it made **zero network requests after page load** (`runs/grader-privacy.json`). A static import-graph check finds no network APIs, no server code and no packages beyond zod (`tests/grader-offline.test.ts`).

## C4

Savings verification no longer reports "verified" in the two tested evidence-free cases, unknown cadence and an off-feed vendor. Both tests fail on the pre-fix code and pass now (`tests/savings.test.ts`).

## C5 (illustrative, simulation_only)

Across 40 runs of one demo company:
- fixing all detected waste adds a median 0.40 months of runway;
- delaying one $15k/month hire by 3 months adds 0.56;
- waste is never the single biggest lever (0/40).

These numbers follow from the planted waste size and the chosen hire parameters; one-time savings are excluded (`runs/runway-levers.md`). Use only for "waste is one lever among several".

## C6 (narrowed)

On generated history, the P10–P90 cash band is far too narrow: 1.4–2.5% of P50 wide.

- **As generated** (revenue growing): it contained realized cash 59% / 41% of the time at 3 / 6 months, and most misses fall *above* P90.
- **Under a steady hiring ramp:** coverage is 7% / 0%, and realized cash is below P10 in 100% of cases at 6 months (`runs/runway-backtest.md`).
- **Revenue-drop and one-off-bill rows** show that a history-only band cannot foresee shocks that land after the forecast date. That is a different point from miscalibration.
- **Small N:** the 200 forecasts per row are 40 runs × 5 overlapping origins, not independent.

**Product response:** the band is relabelled "range from past swings", and Copilot is told p10 is not a worst case. A trend-aware range is the top next step.

## Not a claim: pilot I1 (portfolio triage)

The pilot is inconclusive by test design (plan review). Recall@5 was 96.5% vs 95.8% (`runs/portfolio-triage.md`). At similar runway (9–11 months), the composite separated better: AUC 0.747 vs 0.650, reproduced by the audit (session/trace evidence only).
