# Experiment Plan

Problem anchor: see `PROBLEM_ANCHOR.md` (trust on unfamiliar ledgers + a no-signup CSV grader on the same engine).

All evaluations are `synthetic_proxy` (generator truth + external perturbations). Claims are capped at "in simulation / on synthetic ledgers". Seeds: 20 × 2 noise levels unless stated.

## Claims and the experiment that tests each

**C1. Under every realistic stress setting, each detector keeps precision ≥ 90% and recall ≥ 90% after the fixes.**
- *Settings:* all of `src/lib/eval/perturb.ts` except `harsh_day_jitter` (a sensitivity bound) and `unaliased_rename` (a vendor-naming limit scored by exact key; reported separately).
- *Experiment:* `npm run stress-eval` before vs after the fixes. The baseline row must stay 100/100, and `npm run eval` must stay at 100% precision and recall.
- *Fixes under test:*
  - (a) price increase must be a step change, not smooth usage growth;
  - (b) a same-day repeat that recurs month after month is a second seat or workspace, not a double charge, and doesn't count as an idle cardholder's "other spend";
  - (c) a double charge already refunded is not a finding.
- *Falsified if:* any realistic setting stays below 90% precision or recall for any detector, or the baseline or eval regresses.

**C2. The CSV grader reproduces the connected-account runway within 0.25 months for every supported layout, and finds the same waste whenever the export has cardholder data.**
- *Experiment:* `scripts/csv-parity.ts` (4 layouts) after the C1 fixes.
- *Falsified if:* runway Δ > 0.25 months for any layout, or waste recall < 100% for Rho- or Mercury-style layouts.
- *Known, stated limits (not failures):* generic layouts lose idle-card detection; checking-only uploads see no card waste.

**C3. The grader runs entirely in the browser: no bank data leaves the device.**
- *Experiment:*
  - a unit check that the grader's code path (`importCsv` → `analyze` → findings) is pure, with no `fetch` or network imports;
  - the page's CSP `connect-src 'self'`, with the grader making zero network requests while analyzing a file (Playwright request log).
- *Falsified if:* any request is made during analysis.

**C4. Savings verification never reports "verified" without evidence.**
- *Experiment:* regression tests for unknown cadence and off-feed vendors (`tests/savings.test.ts`), already passing; re-checked after all changes.

**C5. (Desk / honesty) How big is SaaS waste vs other runway levers on the demo cohort?**
- *Experiment:* months of runway from (i) fixing all detected waste vs (ii) delaying one $15k/month hire by 3 months vs (iii) holding AI spend flat. Computed with existing libs over the 40 baseline companies (I11).
- *No pass/fail:* the result decides wording in the README and pitch.

**C6. (Honesty) How well does the existing Monte Carlo band cover realized cash?**
- *Experiment:* rolling-origin backtest of `forecastCash` on generated history. Coverage of realized cash at 3 and 6 months ahead, using only data before each origin (I2, existing-method half).
- *No pass/fail:* the number is reported as-is and shown in the product if it is informative.

## Ablations

C1 gets one setting at a time, each fix alone vs all fixes, to show which fix addresses which failure.

## Run order and budget
1. C1 fixes → stress-eval → eval (minutes).
2. C2 parity re-run (seconds).
3. Grader UI → C3 browser check (minutes).
4. C5 and C6 scripts (seconds to minutes).
5. Inbox $-sort (product hygiene; covered by unit tests).

The total compute budget is well under 1 hour of local CPU.
