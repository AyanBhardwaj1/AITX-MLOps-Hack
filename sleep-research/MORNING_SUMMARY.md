# Morning summary

**Outcome:** I built a free, browser-only CSV Runway Grader and hardened the waste detectors against messier ledgers. A test set written separately from the fixes went from 0–50% precision on the affected detectors to 100%, though that set is no longer a fully blind test. Two independent checks then changed how the product describes itself honestly.

Reviews were by fresh Claude reviewers (no other model family was available), so every verdict below is **provisional**.

## Direction and why this idea won
- **Direction:** market research turned into product.
- **Ideas:** five research angles produced 25 ideas, merged to 18. A cold reviewer picked three pilots.
- **Why this one won:** detector robustness and the CSV grader were the only pilots that tested existing code on inputs it wasn't tuned for, and both produced real findings. The grader is a no-signup front door for any bank's customers, which matters because Rho alone is a small market.
- **The advisor console lost.** It is crowded (Rho, Mercury and Ramp give free multi-client portals; Fathom ranks clients). Its ranking pilot was inconclusive because of how I designed the test.

## What ran (all local, all seconds to a minute; synthetic data only)

| Check | Headline | File |
|---|---|---|
| Detector stress test | Usage growth read as a price increase (43% precision); second workspaces read as double charges (4%); refunds ignored (0%). All fixed | `sleep-research/runs/stress-eval.md` |
| Separately written held-out set (15 variants) | Before: 36–50% and 4–15% precision on the affected cases. After: 100% / 100% | `runs/heldout-before-fixes.md`, `runs/heldout-after-review1.md` |
| CSV grader vs connected account | Runway within 0.05 months across 7 export layouts | `runs/csv-parity.md` |
| Grader privacy (one browser session) | 0 network requests while grading | `runs/grader-privacy.json` |
| Forecast backtest | The P10–P90 band held real cash only 59% / 41% of the time (3 / 6 months); after a hiring ramp, 7% / 0% | `runs/runway-backtest.md` |
| Runway levers | Fixing all waste: +0.40 months; delaying one hire: +0.56. Waste was the biggest lever in 0/40 runs | `runs/runway-levers.md` |

## Review
- **Round 1:** 5/10, "almost". It found 5 real defects, including the grader double-counting card spend for two-file uploads and two regressions in my own fixes. All fixed.
- **Round 2:** 6/10, "almost". That met the stop rule. Two more grader bugs were fixed after it; remaining limits are stated in the README.
- **Integrity audit:** WARN, no FAIL. Every number reproduced.

## Claims
- **Supported:** the grader makes no network requests while grading (narrowed: one session plus a static code check). Savings verification no longer says "verified" without evidence (two tested cases).
- **Narrowed:**
  - Detector fixes hold on the named test shapes of one generated company. The held-out set is no longer blind, and the planned per-fix comparison (ablation) wasn't run.
  - CSV runway matches given a typed cash balance; the Rho/Mercury column layouts are my assumptions.
  - The forecast range is miscalibrated (it is now labelled "range from past swings").
  - "Waste is one lever among several" is an illustration only.
- **Refuted / limits:** some detector cases still fail:
  - bills flat for a year that then grow;
  - three or more price raises;
  - double charges roughly 3 or 12 months apart.

  These are stated in the README.

## Decisions made without asking
- Kept working on the `claude/determined-ramanujan-8nil91` branch and committed as I went. Kept the free grader public (it never sends data anywhere).
- Relabelled the forecast range instead of rebuilding the forecast tonight.
- Changed finding wording from "price up" to "bill up".

## Waiting on you
- Real-world evidence: a few real (anonymised) bank exports to test the grader's assumed column layouts, and a design-partner founder or fractional CFO.
- Rho partner-API approval (email api-partner-request@rho.co) to connect real accounts.
- The deploy itself: import the repo on Vercel.

## Next step
Build a forecast range that accounts for trends, and judge it with the same backtest. It is the largest remaining honesty gap, and the backtest that would score it already exists.
