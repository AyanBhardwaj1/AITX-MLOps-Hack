# Experiment Tracker

Evaluation types follow `integrity.md`. With no real users or ledgers in this sandbox, every run is `synthetic_proxy`: the ground truth is the generator's planted truth, and perturbations are external transforms.

| # | Pilot / run | Config | Eval type | Status | Output | Wall clock |
|---|---|---|---|---|---|---|
| P1a | I5 detector stress test, first drift model | 20 seeds × 2 noise × 9 settings; billing drift ±4 days independent per charge | synthetic_proxy | DONE, superseded | not kept (the file was overwritten; the numbers survive only in the session log, so they are **not cited**) | ~5 s |
| P1b | I5 detector stress test, realistic posting model + labelled harsh jitter | 20 seeds × 2 noise × 10 settings (`npm run stress-eval`) | synthetic_proxy | DONE | `sleep-research/runs/stress-eval.json`, `sleep-research/runs/stress-eval.md` | ~5 s |
| P1c | I5 + 4 source-backed settings (split workspaces, refunded double charge, unaliased rename, 12-month history) | 20 seeds × 2 noise × 14 settings | synthetic_proxy | DONE | `sleep-research/runs/stress-eval.json`, `.md` (overwrites P1b; P1b rows are a subset) | ~5 s |
| P2a | I15 CSV parity, first transfer-inference rule | 20 seeds × 2 noise × 4 layouts | synthetic_proxy | DONE, defect found | numbers only in the session log, **not cited**: Mercury/generic net burn +31.9% because "STRIPE TRANSFER" payouts were treated as transfers | ~3 s |
| P2b | I15 CSV parity after the fixes (revenue payouts aren't transfers; an unmatched card payoff is unitemized spend) | 20 seeds × 2 noise × 4 layouts (`npx tsx scripts/csv-parity.ts`) | synthetic_proxy | DONE | `sleep-research/runs/csv-parity.json`, `.md` | ~3 s |
| P3 | I1 portfolio triage: trailing-runway sort vs composite (P10 runway, 30-day run rate excluding big one-offs) | 30 portfolios × 30 companies; 6 revenue drops, 5 one-off bills, 5 seasonal dips, 14 normal; cash 0.35–1.10× (`npx tsx scripts/portfolio-triage.ts`) | synthetic_proxy | DONE | `sleep-research/runs/portfolio-triage.json`, `.md` | ~21 s |
| R1 | C6: backtest of the existing P10–P90 cash band | 20 seeds × 2 noise × 5 origins × 2 profiles (as generated, hiring ramp) (`npx tsx scripts/runway-backtest.ts`) | synthetic_proxy | DONE | `sleep-research/runs/runway-backtest.json`, `.md` | ~10 s |
| R2 | C5: runway levers desk calculation | 40 baseline demo companies (`npx tsx scripts/runway-levers.ts`) | synthetic_proxy | DONE | `sleep-research/runs/runway-levers.json`, `.md` | ~2 s |
| H0 | C1 held-out set on the **unfixed** detectors | 15 frozen variants × 20 seeds × 2 noise (`npx tsx scripts/heldout-eval.ts before-fixes`) | synthetic_proxy | DONE | `sleep-research/runs/heldout-before-fixes.json`, `.md` | ~10 s |
| H1 | C1 held-out set **after** fixes (run once; fixes were developed on dev settings only) | 15 frozen variants × 20 seeds × 2 noise (`npx tsx scripts/heldout-eval.ts after-fixes`) | synthetic_proxy | DONE | `sleep-research/runs/heldout-after-fixes.json`, `.md` | ~10 s |
| P1d | Dev stress settings after fixes | `npm run stress-eval` | synthetic_proxy | DONE | `sleep-research/runs/stress-eval.json`, `.md` (overwrites P1c; before-fix dev numbers preserved in commit 7b3b966) | ~5 s |
