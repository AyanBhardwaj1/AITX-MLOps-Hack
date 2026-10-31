# Experiment audit — round 1 trace

Reviewer: fresh same-family subagent (Claude), given file paths only. Route: same-family (provisional).

## Prompt (verbatim)

You are a fresh, independent integrity auditor. Audit the evaluation directly; do not trust any summary. Report only — do not modify any repo file except your output files.

Repo: /home/user/AITX-MLOps-Hack. Context: an autonomous "sleep-research" run on a startup-finance product (Runway). There are no real users or ledgers; all experiments run on a synthetic company generator (src/lib/seed/demo-company.ts) with planted waste as ground truth.

Eval code:
- src/lib/eval/score.ts, src/lib/eval/perturb.ts (dev stress settings), src/lib/eval/heldout.ts (held-out set, reportedly written blind to detector code and frozen in commit cfec0db before fixes — verify via `git log --oneline -- src/lib/eval/heldout.ts` and `git show cfec0db --stat`, and check that later commits did not modify heldout.ts)
- scripts/stress-eval.ts, scripts/heldout-eval.ts, scripts/csv-parity.ts, scripts/portfolio-triage.ts, scripts/runway-backtest.ts, scripts/runway-levers.ts, scripts/grader-privacy-check.cjs, scripts/eval.ts
- Detector code under test: src/lib/detect/findings.ts, src/lib/detect/recurring.ts; CSV import: src/lib/csv/import.ts; grader: src/lib/grader.ts
Result files: /home/user/AITX-MLOps-Hack/sleep-research/runs/*
Claimed numbers: /home/user/AITX-MLOps-Hack/sleep-research/EXPERIMENT_TRACKER.md, /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md (Pilots section), /home/user/AITX-MLOps-Hack/sleep-research/EXPERIMENT_PLAN.md (claims C1–C6), and commit messages (`git log --oneline -40`).

Check each, PASS / WARN / FAIL with evidence (file:line or file + value):
A. Ground-truth provenance: is truth from the generator's planted list (and documented perturbation adjustments), or derived from detector outputs anywhere?
B. Score normalization: any rescaling by the method's own outputs?
C. Result existence: does every number claimed in the tracker, IDEA_REPORT pilots and recent commit messages appear in a result file? Re-run the scripts if needed (they are fast: `npm run stress-eval`, `npx tsx scripts/heldout-eval.ts audit-rerun`, `npx tsx scripts/csv-parity.ts`, `npx tsx scripts/runway-backtest.ts`, `npx tsx scripts/runway-levers.ts`, `npx tsx scripts/portfolio-triage.ts`) and compare; if re-running overwrites files, restore them with `git checkout -- sleep-research/runs` afterwards (except a new heldout-audit-rerun file, which you may leave). Flag any numbers that are now stale because code changed after the run (e.g., results computed before a later detector change).
D. Dead code: metric functions defined but never called, results computed but never written?
E. Scope: do words like "robust", "every", "all", "100%" match the actual N (seeds, settings, one company shape)?
F. Evaluation type per experiment: real_gt / synthetic_proxy / self_supervised_proxy / simulation_only / human_eval.
G. Held-out integrity: was heldout.ts changed after the before-fixes run? Were fixes tuned against held-out results (check commit order and contents)?
Overall verdict and the claims (C1–C6) each failure affects.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write your audit as /home/user/AITX-MLOps-Hack/sleep-research/EXPERIMENT_AUDIT.md and the prompt + verbatim response to /home/user/AITX-MLOps-Hack/sleep-research/traces/audit/round1.md. Return the audit as your final message.

## Response (verbatim)

# Experiment Audit (round 1)

Auditor: a fresh same-family subagent. It read the code, git history and result files directly and re-ran every script. Repo HEAD at audit time: `435fcb8` (a README commit landed during the audit; no eval code or result file changed).

## Overall verdict: WARN

The core numbers hold up. On current HEAD, every committed result file reproduced byte-for-byte, ignoring `generatedAt`:
- `stress-eval`, `heldout` (as `heldout-audit-rerun`), `csv-parity`, `runway-backtest`, `runway-levers` and `portfolio-triage`;
- `npm run eval` stays at 100/100;
- `tests/{savings,heldout,grader,detect}.test.ts` pass (154 tests).

Ground truth always comes from the generator's planted list plus written-down adjustments, never from detector output. `heldout.ts` has not been modified since it was frozen.

No check fails outright. There are warnings:
- the held-out run's "blind" and "run once" properties are not evidenced in the repo;
- one cited number has no result file;
- a few evaluation-type labels are wrong;
- the C1 ablation and the C3 unit check were planned but not done;
- some wording is broader than the measured scope.

| Check | Verdict | Claims affected |
|---|---|---|
| A. Ground-truth provenance | PASS for C1/C2/C6; WARN for the I1 pilot | (I1 pilot only) |
| B. Score normalization | PASS | — |
| C. Result existence / staleness | WARN | C1 (staleness, resolved), C2 (one number) |
| D. Dead code / unexecuted plan items | WARN | C1, C3 |
| E. Scope wording | WARN | C1, C2 |
| F. Evaluation types | WARN (labels) | C2, C5, I1 pilot |
| G. Held-out integrity | WARN | C1 |

---

## A. Ground-truth provenance: PASS (WARN for the I1 pilot)

- **Detector truth.** The truth list is the generator's planted `truth` array (`src/lib/seed/demo-company.ts:228-235`).
  - `scoreFindings` compares findings against it by exact `kind|vendorKeys` (`src/lib/eval/score.ts:30-35`).
  - Every truth change is in the perturbation code and stated beside it:
    - `perturb.ts`: `sharedCard` drops zombie; `refundedDoubleCharge` drops `duplicate_charge`.
    - `heldout.ts`: `realPriceStep` adds `price_creep`; `splitIdleCardFigma` raises zombie cents; the refund variants drop or reduce `duplicate_charge`.
  - No script derives truth from `analyze()` findings.
- **Backtest (C6).** Realized cash comes from the generator's cash flows (`scripts/runway-backtest.ts`, `cashNow - cashFlowAfter(...)`), not from the forecaster. PASS.
- **CSV parity (C2), part 1** scores against planted truth. **Part 2** (`agreement`) compares CSV findings with API findings from the same engine. That is a consistency check by design and is labelled as one in the md. This is fine, but see F.
- **WARN: I1 portfolio triage.** The label is `analyze(...).snapshot.runwayMonths < 6` at ASOF (`scripts/portfolio-triage.ts:100-102`). That is the product's own trailing-runway metric, which is also the baseline ranker. The truth is therefore derived from the method family under test, not from the planted profiles. The plan reviewer already flagged this, and the pilot is reported as inconclusive. No C-claim depends on it.
- **Minor inconsistency, no effect on precision/recall.** The dev setting `split_workspaces` (`perturb.ts:203`) says "Truth unchanged". Its second Miro workspace sits on Priya's idle card, though, so after the fix the zombie finding is $573/mo against $423 in truth (40/40 runs). The held-out analogue (`split_ws_idle_card_figma`) does adjust truth. Exact-key scoring ignores amounts, so P/R are unaffected.

## B. Score normalization: PASS

- Nothing is rescaled by the method's own outputs.
- `ratio(n, 0) = 1` (`score.ts:26`) only matters when nothing is planted and nothing is found. The scripts aggregate raw TP/FP/FN and print `n/a` for empty denominators (`stress-eval.ts`, `heldout-eval.ts`), so no vacuous 100% is shown.
- The backtest's band width is reported as a share of the forecast's own P50. That is a descriptive width, not a score.

## C. Result existence and staleness: WARN

**Reproduced on HEAD:**
- every number in `EXPERIMENT_TRACKER.md` rows P1b–P1d, P2b–P2c, P3, R1b, R2, H0 and H1;
- the IDEA_REPORT pilot table;
- the commit messages for `47bc660`, `71b223c` and `b593b00`.

For example:
- held-out "after": 100% in all 15 variants, with `n/a` for `duplicate_charge` in the 3 full-refund variants;
- CSV runway Δ: median 0.00, max 0.05;
- recall@5: 95.8% vs 96.5%;
- levers: 0.40 / 0.56 / 0.19 / 0.20, and 0/40;
- backtest coverage: 59/41/7/0/52/34/49/10%;
- C3: 0 requests, 0 errors, runway 12.2.

**Staleness checked, resolved.** `68960b8` changed `src/lib/detect/recurring.ts:56` (the same-day sort order). That was *after* `heldout-after-fixes` (09:32:49) and `stress-eval` (09:32:30) were generated. `runway-levers` (09:16) and `portfolio-triage` (09:11) also predate the detector fixes in `47bc660`. My re-runs on HEAD give identical JSON (`sleep-research/runs/heldout-audit-rerun.{json,md}` kept), so none of these numbers is stale. The committed H1 file is still a pre-`68960b8` artifact. Point to the audit re-run, or regenerate it, if "H1 reflects shipped code" matters.

**Numbers without a result file:**
1. **"+31.9% burn"** (`IDEA_REPORT.md:150`; also `EXPERIMENT_TRACKER.md:10`, which says the P2a numbers are "**not cited**" and then cites this one).
   - No result file has it.
   - It cannot be regenerated from any commit, because the import fix was committed together with the parity script in `a900d44`.
   - It is non-load-bearing (it describes a defect that was fixed). It should be dropped or marked as coming from the session log only.
2. **"AUC 0.747 vs 0.650 (9–11 months, 202 companies)"** and **"kept 899 of 900"** (`IDEA_REPORT.md:155-156, 213`).
   - These exist only in the reviewer trace (`traces/plan/round1.md:89, 97`), from a scratch diagnostic.
   - I reproduced them exactly: n = 202, 78 troubled, AUC 0.6501 / 0.7473; pending 899 of 900.
   - They are correct, but they have no run file.
3. **Pre-fix I5 numbers in `IDEA_REPORT.md:157-174`** (43%, 4%, 0% recall, 0%, 88–98%) cite `runs/stress-eval.md`.
   - That file now holds the post-fix numbers.
   - The cited values exist only at `git show 7b3b966:sleep-research/runs/stress-eval.md`. I checked: they match.
   - The tracker (P1d) says so; the IDEA_REPORT pointer does not.

## D. Dead code and planned-but-unrun items: WARN

- **Amounts are never scored.** `heldout.ts` carefully sets truth dollars (partial refund `oneTimeCents = charge - refund`; idle-card zombie `+cents`; real-step `new - old`). `heldout-eval.ts` reports only per-kind TP/FP/FN, and exact-key matching ignores amounts. So "partial refunds keep the remainder" is checked only by the unit test `tests/detect.test.ts:204-209`, not by the held-out harness.
  - A scratch check on HEAD found that finding amounts differ from truth amounts by more than 10% in:
    - `refunds`: 12/240 Canva findings, netted by the generic partial refunds;
    - `split_workspaces`: 40/240 (above);
    - `usage_noise_on_datadog_step`: 20/240 (price-creep amount off by 17–33% under the noise);
    - `usage_mild_hubspot_slack_notion`: 36/240 (`duplicate_tools` HubSpot/Salesforce).
  - None of this affects any claim as worded. But held-out C1 says nothing about the dollar figures the product shows.
- **The C1 ablation was planned, not run.** `EXPERIMENT_PLAN.md:48-50` ("each fix alone vs all fixes") has no script, run or tracker row.
- **The C3 unit check was planned, not implemented.** `EXPERIMENT_PLAN.md:33` plans a unit check that the grader path has no `fetch` or network imports. `tests/grader.test.ts` has no such test.
  - My static walk of `src/lib/grader.ts`'s import graph found no `fetch`, XHR, `sendBeacon` or `WebSocket`: 18 files, external dependency `zod` only. So the claim holds today, but the planned guard does not exist.
- Nothing else is computed and then dropped: `scoreCategories` is used by `eval.ts`; `dollarRecall` is reported by `stress-eval`; the backtest's `widthPct` is reported.

## E. Scope wording: WARN

Measured N for C1:
- 1 generated company shape (Taco Robotics);
- 20 seeds × 2 noise levels;
- 10 realistic dev settings plus 15 held-out variants, covering 3 failure modes.

Where the wording goes beyond that:
- **Commit `47bc660` title: "detectors hold up on real-world ledger shapes".** These are synthetic perturbations of one company, not real-world ledgers. The README section it fed is properly hedged ("one generated company shape (`synthetic_proxy`), not real ledgers"). The commit title is not, and it is permanent. Don't reuse that phrasing.
- **`IDEA_REPORT.md:186`, "≥ 90% precision under every realistic setting".** This is the pre-amendment wording. `EXPERIMENT_PLAN.md` narrowed it to "the named settings, on one generated company shape"; IDEA_REPORT was not updated.
- **README:150 and the `47bc660` body, "100% precision and recall on all 15 variants" / "all variants 100%".** This is accurate per cell. However, in the 3 full-refund variants the affected detector (`duplicate_charge`) is `n/a / n/a`: nothing planted, nothing found, which is the correct outcome. Say "no false double charges", not "100% precision and recall", for those.
- **`IDEA_REPORT.md:150`, "Generic all-accounts loses only idle-card detection".** The plan review added a second limit (merged seats can hide `duplicate_tools` or create false double charges), and `EXPERIMENT_PLAN.md` C2 states it. The IDEA_REPORT row still says "only".
  - A scratch check on HEAD found the false-double-charge case no longer arises after the `47bc660` recurring-pair rule (0 in 20 runs with all seats at $25, generic layout).
  - So "only" may now be true, but no run file shows it.
- **C2 part 2** uses 10 seeds and clean descriptors only (`csv-parity.ts`, `generateDemoCompany({ seed })`). The tracker row says "27 settings × 10 seeds × 4 layouts" without "clean". The md says "clean".
- **C3** is 1 session with one file. The CSV path and its layout are not recorded in `grader-privacy.json`; the tracker says "Mercury-style". Fine for the claim as worded ("no request during analysis"), but say N = 1.

## F. Evaluation type per experiment

| Run | Tracker label | Audited type | Note |
|---|---|---|---|
| P1b–P1d stress-eval, `npm run eval` | synthetic_proxy | synthetic_proxy | Correct. |
| H0/H1 held-out | synthetic_proxy | synthetic_proxy | Correct. |
| P2b CSV parity, part 1 (vs truth) | synthetic_proxy | synthetic_proxy | Correct. |
| P2c CSV vs API agreement | synthetic_proxy | **self_supervised_proxy** | Reference is the same engine's API output, so this is consistency, not accuracy. The `rho_csv` match holds by construction (stated). |
| P3 portfolio triage | synthetic_proxy | **self_supervised_proxy** | Label = the engine's own trailing runway (A). |
| R1/R1b backtest (C6) | synthetic_proxy | synthetic_proxy | Correct. |
| R2 levers (C5) | synthetic_proxy | **simulation_only** | Desk calculation with no truth. It sizes waste from *detected* findings, which equal planted truth on baseline (100/100). |
| C3 grader privacy | real browser check | real_gt (direct observation), N = 1 | Correct in substance. |
| C4 savings tests | — | unit tests on constructed cases | Pass. |

No run is human_eval or real_gt on real ledgers, and none claims to be.

## G. Held-out integrity: WARN

**Verified:**
- `git log -- src/lib/eval/heldout.ts` shows only `cfec0db`. HEAD has no diff against it, so it was not changed after the before-fixes run.
- Order: `cfec0db` (frozen, 09:29:14) → H0 generated at 09:29:24 and committed in `bd2c27b` → fixes in `47bc660` (09:33:09). H0's failures (43/36/50% `price_creep`, 4/15/4% and 0% `duplicate_charge`, 0% zombie recall) match the pre-fix dev results in `7b3b966`. H0 therefore ran on unfixed detectors.
- The held-out set uses vendors and parameters that differ from dev:
  - usage growth on HubSpot/Slack/Notion/GWS/GitHub/Loom, vs Intercom/Sentry/Vercel in dev;
  - second workspaces on Notion/Linear/Slack/Intercom/Figma, vs Miro;
  - refunds at +1, +20 days, a different descriptor and partial, vs a full refund at +6.
- Its spec thresholds (≥ 20% and ≥ $25/mo) differ from the detector constants (10%, $20; `findings.ts` header). That is weak evidence it was not copied from the code.

**Not evidenced, or weakened:**
1. **"Written blind by a separate agent" has no trace.** `traces/` holds no held-out authoring prompt or response. The README states it as fact.
2. **"Run once" cannot be checked.** The output file would be overwritten on a re-run, and nothing records how many runs there were.
3. **The final fix edit came after the held-out failures were visible.**
   - `findings.ts` was last written at 09:32:09, 2 min 45 s after H0 was generated.
   - `grader.ts`, part of the same commit, was written at 09:27:58, before the freeze. So the fix commit was being assembled around the freeze, and the repo cannot show which parts of the fix existed before H0.
   - The short window makes extensive tuning unlikely, but it does not rule out a look-and-adjust.
4. **Spec-level leakage.** The plain-language spec the held-out writer worked from was written by the same agent that wrote the fixes. Two fix details match held-out-only cases with no dev counterpart:
   - netting partial refunds, keeping the remainder (`refund_partial_half`; dev has no partially refunded double charge);
   - a 30-day refund window (`findings.ts:18`) that covers the held-out +20-day refund (dev uses +6).

   Both are natural design choices, and this leakage is about the spec, not the results. Still, the held-out set is "blind to the code", not "unknown to the fixer".

Recommended (cheap): save the held-out author's prompt and response under `traces/`, if they still exist in the session. Change the README wording from "run once" to what can be shown, e.g. "first committed after-fixes run". Do not re-tune anything against the held-out set from here on.

## Per-claim impact

- **C1 (detector fixes, held-out).** Numbers reproduce and pass the pre-registered bar. Warnings:
  - G: blindness and run-once not evidenced; spec-level leakage on refund handling.
  - D: no ablation; dollar amounts unscored.
  - E: the "real-world" and "every setting" wording.
  - The stated seat-step exception did not occur (100/100). That is fine; report it as "did not occur" rather than as a limit.
- **C2 (CSV parity).** It holds as narrowed: max runway Δ 0.17 across all settings and layouts; Rho and Mercury layouts 100% agreement. Warnings:
  - F: the agreement table is a consistency check;
  - C: the +31.9% figure has no file;
  - E: the IDEA_REPORT "only idle-card" wording; part 2 is clean-only.
- **C3 (grader privacy).** The Playwright evidence matches the claim (N = 1). The planned unit check is missing; a static scan supports the claim.
- **C4 (savings verification).** PASS. Regression tests at `tests/savings.test.ts:116, 125` pass.
- **C5 (levers).** The numbers reproduce. Relabel it as `simulation_only`.
- **C6 (band backtest).** PASS. The numbers reproduce and the truth is generator cash.
