# Experiment Plan

Problem anchor: see `PROBLEM_ANCHOR.md` (trust on unfamiliar ledgers + a no-signup CSV grader on the same engine).

All evaluations are `synthetic_proxy` (generator truth + external perturbations). Claims are capped at "in simulation / on synthetic ledgers". Seeds: 20 × 2 noise levels unless stated.

## Claims and the experiment that tests each

> **Amended after the plan review** (`traces/plan/round1.md`):
> - C1 is judged only on a **held-out** set written by a fresh agent from plain-language failure descriptions, before any fix. It is frozen in `src/lib/eval/heldout.ts`, run once on the unfixed code, and the fixes are developed against the dev settings only.
> - `combined` = the realistic dev settings only (no unaliased rename, no harsh jitter). Harsh jitter is reported in the same table, with its exclusion stated as a limit.
> - Wording is narrowed throughout to "the named settings, on one generated company shape".

**C1. On the held-out settings for the three failure modes, each affected detector keeps precision ≥ 90% and recall ≥ 90% after the fixes, with the dev settings, baseline and eval unchanged or improved.** Expected exception, stated in advance: seat-step growth on a seat-priced tool. Bank data cannot tell it from a price step, so it is reported as a limit, not counted as a pass or fail.
- *Settings:* all of `src/lib/eval/perturb.ts` except `harsh_day_jitter` (a sensitivity bound) and `unaliased_rename` (a vendor-naming limit scored by exact key; reported separately).
- *Experiment:* `npm run stress-eval` before vs after the fixes. The baseline row must stay 100/100, and `npm run eval` must stay at 100% precision and recall.
- *Fixes under test:*
  - (a) price increase must be a step change, not smooth usage growth;
  - (b) a same-day repeat that recurs month after month is a second seat or workspace, not a double charge, and doesn't count as an idle cardholder's "other spend";
  - (c) a double charge already refunded is not a finding.
- *Falsified if:* any realistic setting stays below 90% precision or recall for any detector, or the baseline or eval regresses.

**C2 (narrowed).** Given a correctly typed cash balance, the CSV grader reproduces the rules-only API runway within 0.25 months on the generated ledger. It finds the same waste as the API on exports with cardholder data, on the baseline **and on the perturbed ledgers** (CSV vs API findings).
- The Rho-style layout is our own export format, so its match holds by construction and is reported as such.
- The grader does not use the connected product's LLM vendor labels.
- Generic layouts also lose per-person seat separation: merged seats can hide a duplicate-tools finding and create false double charges when seats share one price.
- *Experiment:* `scripts/csv-parity.ts` after the C1 fixes. It started with 4 layouts; review rounds 1–2 added a two-file upload, a checking export with named debit rows, and one account split into two date ranges.
- *Falsified if:* runway Δ > 0.25 months for any layout, or waste recall < 100% for Rho- or Mercury-style layouts.
- *Known, stated limits (not failures):* generic layouts lose idle-card detection; checking-only uploads see no card waste.

**C3. The grader runs entirely in the browser: no bank data leaves the device.**
- *Experiment:*
  - a unit check that the grader's code path (`importCsv` → `analyze` → findings) is pure, with no `fetch` or network imports;
  - a Playwright request log covering the **whole session after the file is chosen**, with zero requests. The CSP is not evidence here, since `connect-src 'self'` would still allow posting to our own server.
- *Falsified if:* any request is made during analysis.

**C4. Savings verification no longer reports "verified" in the two tested evidence-free cases** (unknown cadence, off-feed vendor).
- *Experiment:* regression tests for unknown cadence and off-feed vendors (`tests/savings.test.ts`), already passing; re-checked after all changes.

**C5. (Desk / honesty) How big is SaaS waste vs other runway levers on the demo cohort?**
- *Experiment:* months of runway from (i) fixing all detected waste vs (ii) delaying one $15k/month hire by 3 months vs (iii) holding AI spend flat. Computed with existing libs over the 40 baseline companies (I11).
- *No pass/fail; illustration only* (one company shape, with the same planted waste in every run). It must not be the basis of README or pitch claims beyond "waste is one lever among several".

**C6. (Honesty) How well does the existing Monte Carlo band cover realized cash?**
- *Experiment:* rolling-origin backtest of `forecastCash` on generated history. Coverage of realized cash at 3 and 6 months ahead, using only data before each origin (I2, existing-method half).
- *No pass/fail; generator-bound.* Report the band width next to coverage, and backtest the revenue-drop, one-off and seasonal-dip profiles too. It can't support claims about real companies.

## Ablations

C1 gets one setting at a time, each fix alone vs all fixes, to show which fix addresses which failure.

## Run order and budget
1. C1 fixes → stress-eval → eval (minutes).
2. C2 parity re-run (seconds).
3. Grader UI → C3 browser check (minutes).
4. C5 and C6 scripts (seconds to minutes).
5. Inbox $-sort (product hygiene; covered by unit tests).

The total compute budget is well under 1 hour of local CPU.
