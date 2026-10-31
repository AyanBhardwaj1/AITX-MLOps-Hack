# Narrative report: trust on unfamiliar ledgers, and a free front door

Run `runway-market-wedge-20261031`. Reviewer route: **same-family (provisional)**, meaning fresh Claude subagents given file paths only. No other model family was available.

## Problem

Runway reads a startup's bank feed and finds wasted spend. The market research (`reports/Runway product go to market.md`, `sleep-research/IDEA_REPORT.md`) says:
- Single-bank runway dashboards are now free (Mercury).
- Ramp already ships SaaS-waste agents for its own cards.
- What's left open is a trustworthy, bank-agnostic read for small teams and an acquisition path beyond one bank.

The question was which product wedges most raise the odds of adoption, retention and payment, with each answer tested as far as a sandbox without real users allows.

## Core claim (narrowed by the claims judge)

1. On one generated company shape, three detector failures appeared under realistic ledger shapes, and all three are fixed:
   - steady seat or usage growth read as a price increase;
   - recurring second workspaces read as double charges (and masked idle cards);
   - refunded double charges stayed flagged.

   A held-out set of 15 variants, written by a separate agent from plain-language descriptions, went from 0–50% precision on the affected detectors to 100% precision and recall. The set is no longer blind to the current code (see Limitations).
2. A browser-only CSV Runway Grader, on the same engine, reproduces the connected-account runway within 0.05 months for 7 export layouts, given a typed cash balance. It made zero network requests while grading in a browser check.

## Method

The sleep-research pipeline, with every gate judged by a fresh reviewer:
1. **Brief and landscape.** Corrected after the triage reviewer's landscape warning.
2. **Ideas.** Five lenses produced 25 ideas, merged to 18.
3. **Triage.** The jury picked I5, I15 and I1, and flagged a savings-verification defect (I6), fixed at once.
4. **Novelty checks.** I5 medium as positioning; I15 low; I1 low.
5. **Pilots.** Stress harness, CSV parity, portfolio triage.
6. **Plan review.** It reclassified I1 as inconclusive and required a held-out set.
7. **Build.** The held-out set was frozen before any fix; fixes were developed only on the dev settings.
8. **Integrity audit.** WARN, no FAIL.
9. **Two review rounds.** Each found real regressions; all were fixed or stated.
10. **Claims audit.**

## Results with evidence (each number traces to a file)

| Result | Value | File |
|---|---|---|
| Held-out, before fixes: price-increase precision (3 of 6 usage variants) | 36–50% | `runs/heldout-before-fixes.md` |
| Held-out, before fixes: double-charge precision (3 of 5 split-workspace variants) | 4–15% | same |
| Held-out, after fixes and review re-check | 100% / 100% wherever something was planted or found | `runs/heldout-after-review1.md` |
| Dollar accuracy within 10% of truth (matched findings) | 100% on 13/15 variants; 85%, 92% on two | same |
| Dev stress settings after fixes (except the harsh-jitter and unaliased-rename limits) | 100% / 100% | `runs/stress-eval.md` |
| CSV grader runway parity, 7 layouts | median 0.00, max 0.05 months | `runs/csv-parity.md` |
| Grader network requests while grading (N = 1 session) | 0 | `runs/grader-privacy.json` |
| Forecast band coverage of realized cash at 3 / 6 months (as generated) | 59% / 41% | `runs/runway-backtest.md` |
| Forecast band coverage under a hiring ramp, at 3 / 6 months | 7% / 0% | same |
| Runway gained: fix all waste vs delay one $15k hire 3 months (median) | 0.40 vs 0.56 months; waste biggest in 0/40 | `runs/runway-levers.md` |
| Portfolio triage recall@5: composite vs runway sort | 96.5% vs 95.8% (inconclusive by design) | `runs/portfolio-triage.md` |

## What shipped in the product
- **Detectors:**
  - a price increase must be a step (one or two flat levels) that explains the bill much better than a trend; wording is "bill up X%", since seats and price can't be told apart;
  - repeats inside a detected recurring stream are second workspaces;
  - double charges net out vendor refunds;
  - idle-card vendors are de-duplicated;
  - same-day ordering is deterministic.
- **CSV import:** Rho-, Mercury-style and generic exports, with card payoffs resolved across files, unitemized card spend, per-upload ids, duplicate file and row handling, skipped failed rows, and sign warnings.
- **Free `/grader` page:** public, runs in the browser, states what an upload can't see, and links to the dashboard.
- **Savings verification:** no "verified" without evidence (unknown cadence, off-feed vendors).
- **Inbox:** ordered by first-year value.
- **Forecast range:** relabelled "range from past swings" in the UI and Copilot.
- **Harnesses for anyone to rerun:** `npm run stress-eval`, `scripts/heldout-eval.ts`, `scripts/csv-parity.ts`, `scripts/runway-backtest.ts`, `scripts/runway-levers.ts`, `scripts/portfolio-triage.ts`, `scripts/grader-privacy-check.cjs`.

## Figure and table inventory
- `runs/stress-eval.md`: detector × setting table.
- `runs/heldout-*.md`: held-out tables before, after and on re-check.
- `runs/csv-parity.md`: layout parity and the agreement table.
- `runs/runway-backtest.md`: coverage table.
- `runs/runway-levers.md`: lever table.
- `runs/portfolio-triage.md`: ranking table.
- `.ui-improve/shots/grader.png` (local only): grader screenshot.

## Limitations
- **No real users or ledgers.** Every quantitative result is on one generated company shape. Nothing here shows field accuracy, demand or willingness to pay.
- **Reviews are provisional.** They are same-family, not independent acceptance.
- **The held-out set is not blind to the current code.** The same agent wrote its spec and the fixes, a staircase attempt was rejected with held-out results in view, and the planned per-fix ablation was not run.
- **Known detector failures outside the tested shapes:** flat-then-growth bills; seat additions after a flat year; three or more raises; double charges about 3 or 12 months apart.
- **The grader's Rho/Mercury layouts are assumptions,** untested on real exports. A single checking export sees no card waste.
- **The forecast band is miscalibrated.** It is relabelled, not fixed; a trend-aware range is the next step.
- **Market facts come from search excerpts.** Vendor sites were unreachable from the sandbox, and several prices are `[UNVERIFIED]`.
