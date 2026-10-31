# Intended claims (draft for the claims judge)

All evaluations use one generated company shape with planted waste. Ground truth is the generator's planted list plus documented adjustments.

**C1.** On the 15 held-out stress variants for three failure modes, the affected detectors score 100% precision and recall wherever something is planted or found, after the fixes.
- Before the fixes, on the same set:
  - price increase: 36–50% precision on the usage variants;
  - double charge: 4–15% precision on the split-workspace variants and 0% on full refunds;
  - idle card: 0% recall when a second workspace sits on the idle card.
- Files: `runs/heldout-before-fixes.md`, `runs/heldout-after-fixes.md`, `runs/heldout-after-review1.md`, `runs/stress-eval.md`.
- Dollar amounts are within 10% of truth on 13/15 variants (85% and 92% on two): `runs/heldout-after-review1.md`.
- Caveats:
  - the held-out set was re-checked after being seen (round 1);
  - 15 variants ≈ 15 single planted cases per seed;
  - shapes outside the set (flat-then-growth, three raises, double charges ~3/12 months apart) still fail (README).

**C2.** Given a correctly typed cash balance, the CSV grader reproduces the rules-only API runway within 0.05 months for all 7 tested layouts (median 0.00), on the clean generated ledger.
- With cardholder data (Rho/Mercury-style single file, checking + card files, one account in two date ranges), it finds exactly the API's findings.
- Rho/Mercury-style findings agree with the API on all 27 perturbed ledgers.
- Generic all-accounts agrees except for idle cards.
- A checking-only export sees no card waste.
- Files: `runs/csv-parity.md`, `.json`.
- The Rho/Mercury layouts are our assumptions, untested on real exports.

**C3.** The grader makes no network requests while grading.
- One Playwright session, uploading a Mercury-style file, recorded zero requests after page load: `runs/grader-privacy.json`. That run predates the round-2 grader changes, which made no network-related edits.
- The static import-graph check passes: `tests/grader-offline.test.ts`.

**C4.** Savings verification no longer reports "verified" in two tested evidence-free cases: unknown cadence and an off-feed vendor (`tests/savings.test.ts`).

**C5 (illustrative).** On 40 runs of one demo company, fixing all detected waste adds a median 0.40 months of runway, versus 0.56 for delaying one $15k/month hire by 3 months. Waste is never the single biggest lever (0/40). File: `runs/runway-levers.md`.

**C6.** The existing P10–P90 cash band is miscalibrated on generated history (`runs/runway-backtest.md`):
- Coverage of realized cash is 59% at 3 months and 41% at 6 months.
- Under a hiring ramp, coverage is 7% and 0%, with realized cash below P10 in 100% of cases at 6 months.
- After a revenue drop, realized cash is below P10 in 56% of cases at 6 months; after a one-off bill, 76%.

**Pilot I1 (not a claim):** inconclusive by test design. Recall@5 was 96.5% vs 95.8% (`runs/portfolio-triage.md`).

## Mechanical pre-check (orchestrator ran grep against the result files)

All 26 cited figures were verified in their files. Examples:
- `heldout-before-fixes.md`: 43/36/50/4/15% and n/a/0%;
- `csv-parity.md`: 0.00 / 0.05 and the two exact-match layouts;
- `grader-privacy.json`: an empty request list;
- `runway-levers.md`: 0.40 / 0.56 / 0/40;
- `runway-backtest.md`: 59/41/7/0/56/76%.

None were NOT FOUND.
