# Claims judge, round 1

## Prompt

You are a fresh claims judge. Judge whether the results support each intended claim. Read the files yourself (repo root /home/user/AITX-MLOps-Hack); executor notes are not evidence.

Intended claims and mechanical pre-check: sleep-research/traces/claims/draft.md
Result files: sleep-research/runs/* (verify every number you rely on yourself)
Code under test: src/lib/detect/*, src/lib/csv/import.ts, src/lib/grader.ts; eval code: src/lib/eval/*, scripts/*.ts; tests: tests/*.test.ts
Integrity audit: sleep-research/EXPERIMENT_AUDIT.md (verdict WARN; check what it flagged is reflected)
Review log: sleep-research/AUTO_REVIEW.md and sleep-research/traces/review/round1.md, round2.md

For EACH claim (C1, C2, C3, C4, C5, C6) return:
- claim_supported: yes | partial | no
- what_results_support
- what_results_dont_support
- missing_evidence
- suggested_claim_revision (the exact wording you'd allow)
- next_experiments_needed
- confidence: high | medium | low
One positive result on one company shape does not support a general claim; downgrade confidence where the integrity audit flagged something. A NOT FOUND number has no evidence. Note: the grader-privacy run predates later grader edits — judge whether that matters.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

You may run read-only commands (scripts are fast; restore overwritten files with `git checkout -- sleep-research/runs` afterwards). Write your prompt (under "## Prompt") and full response (under "## Response") verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/claims/round1.md. Do not modify other files. Return the response as your final message.

## Response

### What I checked myself

- **Reproduction on HEAD (`7947abb`).** I re-ran `heldout-eval.ts` (temporary label, deleted afterwards), `csv-parity.ts`, `stress-eval.ts`, `runway-levers.ts`, `runway-backtest.ts` and `portfolio-triage.ts`.
  - The held-out JSON `results` equal `heldout-after-review1.json` exactly.
  - In the other five files, only `generatedAt` changed.
  - I restored them with `git checkout -- sleep-research/runs`. The tree is clean.
  - Every number I rely on below comes from these files, and every one reproduces on current code.
- **Tests.** `tests/{grader-offline,savings,grader,detect,heldout}.test.ts` pass (163 tests).
- **C4 regression check.** I ran the current `tests/savings.test.ts` against the pre-fix tree (`bfb34b8`, in a temporary worktree I then removed). Exactly the two cited tests fail there and pass on HEAD.
- **Draft numbers.** All 26 figures are in the files: 43/36/50, 4/15/4, 0 and n/a/0 (before fixes); 85/92 (dollars); 0.00/0.05; 0.40/0.56 and 0/40; 59/41/7/0/56/76. **None is NOT FOUND.** Several are worded more broadly than what they measure, as listed per claim.
- **Not re-run: the Playwright privacy check.** Playwright is not installed in this checkout.

---

### C1. Detector fixes on the held-out stress set

**claim_supported: partial** (the numbers are right; the wording and the held-out status need narrowing)

**what_results_support**
- After the fixes, every cell for all four detectors in all 15 variants is 100%/100%, except the 3 full-refund variants. There `duplicate_charge` is n/a/n/a: nothing was planted and nothing was found, which is the correct outcome.
  - Sources: `heldout-after-fixes.md`, `heldout-audit-rerun.md`, `heldout-after-review1.md`.
  - The last of these reproduces exactly on HEAD.
- The before-fix figures are in `heldout-before-fixes.md`/`.json`:
  - `price_creep` precision was 43% (54 FP), 36% (70 FP) and 50% (40 FP).
  - `duplicate_charge` precision was 4%, 15% and 4% (1000/232/1000 FP).
  - Full refunds: 0% precision (40 FP each).
  - Idle-card zombie recall was 0% (0/40).
- `heldout.ts` is unchanged since its freeze (`cfec0db`). Truth comes from the generator plus written-down adjustments, not from detector output.
- **Dollar amounts.** For matched findings, the share whose amount is within 10% of truth is 100% in 13 variants. The other two:
  - `usage_mild_hubspot_slack_notion`: 85% (204/240). The off cases are HubSpot/Salesforce `duplicate_tools` at about $710 against $800.
  - `usage_noise_on_datadog_step`: 92% (220/240). The off cases are the Datadog step itself, found at $805–$1,595 against $1,200.

**what_results_dont_support**
- **"36–50% precision on the usage variants"** is true for 3 of the 6 usage-priced variants (mild, heavy, seat steps). The other 3 were already 100% before the fixes.
- **"4–15% on the split-workspace variants"** is true for 3 of the 5 (Notion, Linear, Intercom). "Different amount" and "idle card" were already 100%.
- **"Dollar amounts are within 10% of truth on 13/15 variants"** misstates the measure. It is a per-finding share. In 2 variants, 8–15% of matched findings are off by more than 10%, and one of those is the failure-mode detector itself (Datadog, off by up to ~33%).
- **The held-out status.** The set is no longer a blind test of the current code.
  - Round 1 rejected a staircase fix after it dropped the noisy-Datadog variant to 85%, so the current detector was chosen with the held-out results in view.
  - The audit (G) also found that "written blind" and "run once" are not evidenced. `traces/heldout/author.md` is a reconstruction saved after the audit.
  - There is spec-level leakage: the spec writer is the fixer, and the 30-day refund window and partial-refund netting cover held-out-only cases.
- **What the set tests.** It covers new vendors and parameters for failure modes the fixer had already named, not unknown failure modes.
- **Known open failures (round 2).** Flat-then-growth produces false "bill up" findings (57–72/200; 200/200 for seats added after a flat year). Three raises are missed (0/200). Double charges about 3 or 12 months apart are missed (0/20). The draft lists all of these correctly as outside the claim.
- **Dev settings** (`stress-eval.md`, which C1 cites):
  - `unaliased_rename`: `price_creep` 0%/0%, $ recall 55%.
  - `harsh_day_jitter`: recall 88–98%.
  - These don't contradict C1, but the citation should not read as "all settings pass".

**missing_evidence**
- An ablation of each fix alone (planned, never run; the audit flagged it).
- A fresh held-out set that the fixer has not seen.
- Any non-generated company shape.

**suggested_claim_revision**
> On one generated company (20 seeds × 2 noise levels), across 15 held-out stress variants of three known failure modes (usage-priced bills, split workspaces, refunded double charges), the detectors after the fixes make no false or missed findings: 100% precision and recall wherever something is planted or found, and no false double charges in the 3 full-refund variants. Before the fixes, on the same set:
> - price increase: 36–50% precision in 3 of 6 usage variants;
> - double charge: 4–15% precision in 3 of 5 split-workspace variants, and 0% in all 3 full-refund variants;
> - idle card: 0% recall when a second workspace sits on the idle card.
>
> For matched findings, the dollar amount is within 10% of truth in every case in 13 variants, and in 85% and 92% of cases in the other two (HubSpot overlap; the Datadog step under ±12% noise, off by up to a third).
>
> Caveats:
> - The set was written from a spec by the same agent that wrote the fixes.
> - It was looked at again during review, so it is now a re-check, not a blind test.
> - Each variant is effectively one planted case per run.
> - Flat-then-growth bills, three raises, and double charges about 3 or 12 months apart still fail.

**next_experiments_needed**
- A new held-out batch, written by a fresh agent from failure descriptions the fixer did not write, run once on frozen code. Include the round-2 hinge-growth shape as a negative control.
- The planned per-fix ablation.

**confidence: medium.** The numbers are solid and reproduce. Confidence is downgraded for the audit's held-out-integrity warning, the look-and-select in round 1, and the single company shape.

---

### C2. CSV grader parity with the API

**claim_supported: partial** (the runway part holds; the findings part needs two qualifiers)

**what_results_support**
- **Runway.** In `csv-parity.json` part 1 (20 seeds × clean and noisy, unperturbed ledger, with true cash supplied):
  - The runway Δ median is 0.00 for all 7 layouts.
  - The max is 0.00 for 5 layouts and 0.048 for the two checking-only layouts. That is "within 0.05".
- **Findings against planted truth.** `rho_csv`, `mercury_csv`, `checking_plus_card_files` and `one_account_two_date_ranges` are 100%/100% on every detector, with 0 FP.
- **Agreement on perturbed ledgers** (part 2: 27 settings, which are 12 dev perturbations plus 15 held-out, × 10 seeds, clean noise):
  - The Rho, Mercury, two-file and two-range layouts match the API's finding set in 10/10 runs everywhere, with Δ 0.00.
  - Generic all-accounts matches once idle-card findings are excluded on both sides, with Δ 0.00.
- **Generic all-accounts** finds no idle cards (0/40), as stated.
- The draft correctly says the Rho/Mercury layouts are assumed, not tested on real exports.

**what_results_dont_support**
- **"Clean generated ledger."** Part 1 covers clean *and* noisy noise levels. The intended meaning is "unperturbed".
- **Checking-only on perturbed ledgers.** There the runway Δ reaches 0.17 (refunds), 0.16 (annual billing) and 0.08–0.10 on several held-out variants. "Within 0.05" holds only on the unperturbed ledger.
- **"A checking-only export sees no card waste"** is true for planted card waste (recall 0%). But `mercury_checking_named_debits` produced **2 false idle-card findings in 40 runs**, which is why the md table shows zombie at 0%/0% rather than n/a/0%.
  - I reproduced both. Seed 593 (clean) gave "1 subscription on Maya Thompson's idle card", Pilot, $75/mo. Seed 334 (noisy) gave the same for Brazos Properties (rent), $750/mo.
  - Cause: the harness writes a cardholder name onto every 25th checking ACH debit. That stride can repeatedly hit the same monthly vendor, which then forms a "card" stream with no other spend. This is mostly a harness artifact; a real export would not put a card name on a rent ACH.
  - It is still a false finding the result file records. Part 2 hides it, because it compares this layout with idle-card findings excluded.
- **The agreement result is a consistency check** (same engine on both sides; the audit labels it `self_supervised_proxy`). The Rho and Mercury layouts carry account and cardholder columns, so their agreement holds largely by construction. It is evidence that import loses nothing, not that the findings are accurate.
- **"All 27 perturbed ledgers"** means 27 settings × 10 seeds, clean noise only.
- **Post-stop fixes.** The round-2 fixes (payoff evidence, per-upload ids) are covered by unit tests and this parity run, but no review round re-checked them.
- **A known residual (round 2).** A generic card file whose payment row doesn't match the payoff pattern double-counts spend by about 18%. That layout is not among the 7 tested, so it is a scope limit, not a contradiction.

**missing_evidence**
- A real Rho or Mercury export (even one anonymised file) to confirm the assumed column layouts.
- A named-debits layout that names only rows that would really be card purchases.

**suggested_claim_revision**
> Given the correct cash balance, the CSV grader's runway matches the rules-only API runway on the unperturbed generated ledger (20 seeds × 2 noise levels) for all 7 tested layouts. The median difference is 0.00 months and the maximum is 0.05, the maximum coming from the checking-only layouts. On perturbed ledgers, those layouts reach 0.17.
>
> Findings by layout:
> - With cardholder data (Rho- or Mercury-style single file, checking + card files, one account in two date ranges), the grader finds every planted item with no false findings. It returns exactly the API's findings on all 27 perturbed settings (10 seeds each). That is a consistency check against the same engine.
> - Generic all-accounts matches the API except that it cannot see idle cards.
> - Checking-only exports find no card waste. One synthetic checking layout with cardholder names produced 2 false idle-card findings in 40 runs.
>
> The Rho- and Mercury-style layouts are our assumptions, untested on real exports.

**next_experiments_needed**
- Fix the harness so `importNamedDebits` names only debit-card-style rows (not rent/ACH), re-run, and report the zombie FP count.
- Grade one real anonymised Mercury or Rho export against its bank-reported numbers.

**confidence: high** for the runway numbers and the cardholder-layout results as worded above. **Medium** for the broader "matches the API" framing, since that is a consistency check.

---

### C3. The grader makes no network requests

**claim_supported: partial → yes as narrowed** (N = 1 browser session, plus a static check on current code)

**what_results_support**
- **`grader-privacy.json`:** `requestsAfterLoad: []`, `errs: []`, runway "12.2".
  - The script (`scripts/grader-privacy-check.cjs`) records every page request from upload through results, after `networkidle` on load.
  - The form's `onSubmit` calls `preventDefault()`, so the submit itself sends nothing.
- **`tests/grader-offline.test.ts` passes on HEAD.** It walks `src/lib/grader.ts`'s import graph and finds no `fetch`, XHR, beacon, WebSocket or EventSource, no server code, and no package except `zod`.
  - I checked the test's blind spots against the code. There are no `export … from` re-exports or dynamic `import()` in `src/lib`, so it is adequate for the code as it stands.
- **The staleness does not matter.** The privacy run (09:38) predates **both** review rounds' edits to `grader.ts` and `import.ts` (`c73295a` and `7947abb`), not only round 2 as the draft says.
  - I diffed `b593b00..HEAD` for `src/`. The `grader.ts`/`import.ts` changes are pure data handling: payoff resolution, row de-duplication, ids, notes.
  - The `grader/page.tsx` and `grader-panel.tsx` changes are copy only.
  - None adds a network call, so the run's evidence still applies.

**what_results_dont_support**
- **One session, one file.** The file and its layout are not recorded in the JSON. It is not a general guarantee.
- **The static test starts at `src/lib/grader.ts`, not at the page component.** `grader-panel.tsx` has no network call (grep). It does lazy-import the demo company, which fetches a JS chunk (code, no user data) only when the demo button is used.
- **The draft's sentence is inaccurate.** "Predates the round-2 grader changes, which made no network-related edits" should cover rounds 1 and 2.

**missing_evidence**
- A re-run of the Playwright check on current code. Optional; cheap if Playwright is available. I could not run it here.

**suggested_claim_revision**
> In one browser session that graded a Mercury-style file, the page made zero network requests after load. That run predates the review-round edits to the grader, which changed only data handling and copy. On current code, a static check of the grader's imports finds no network calls and no packages beyond zod.

**next_experiments_needed**
- Optionally re-run `grader-privacy-check.cjs` on HEAD with two files (checking + card) and save the output beside the old one. Nothing more is needed.

**confidence: high** for the narrowed wording.

---

### C4. Savings verification in two evidence-free cases

**claim_supported: yes**

**what_results_support**
- `tests/savings.test.ts` has the two cited tests:
  - "doesn't call an annual tool verified after a month when it has billed only once" (a single charge, so the cadence is unknown);
  - "can't verify a vendor that never appears in this feed".
- Both pass on HEAD.
- Both fail on the pre-fix tree `bfb34b8`; all 12 other tests pass there. So these are genuine regression tests for the `aafac20` fix.

**what_results_dont_support**
- Nothing beyond the two constructed cases. This is a unit-level claim, not an accuracy rate.

**missing_evidence**
- None for the claim as worded.

**suggested_claim_revision**
> Savings verification no longer reports "verified" in two evidence-free cases that unit tests cover: a vendor with only one past charge (cadence unknown) and a vendor that never appears in the feed. Both tests fail on the code before the fix.

**next_experiments_needed**
- None.

**confidence: high**

---

### C5 (illustrative). Runway levers

**claim_supported: yes as an illustrative desk calculation** (`simulation_only`, per the audit; not a finding about companies)

**what_results_support**
- `runway-levers.md`/`.json` (reproduced on HEAD) give medians over 40 runs (20 seeds × 2 noise levels) of one demo company:

  | Lever | Median months gained |
  |---|---|
  | Fix all waste | 0.40 |
  | Delay one hire | 0.56 |
  | Hold AI spend flat | 0.19 |
  | Cut 10% of discretionary spend | 0.20 |

- Waste is the top lever in 0/40 runs.
- The ranges don't overlap: waste 0.34–0.45 against the hire delay at 0.52–0.60.

**what_results_dont_support**
- **The result is set by the inputs, not discovered.** The generator chose how much waste to plant, and the authors chose the hire lever ($15k × 3 months = $45k).
- **"Never the biggest lever"** means "against these three chosen alternatives".
- **The waste lever counts only `monthlySavingsCents`.** It leaves out one-time savings (the double charge).
- **The two levers use different arithmetic.** Waste goes through `simulateSavings`; the hire delay is a lump sum ÷ burn.

**missing_evidence**
- None for an illustrative claim. Real-company evidence would be needed for any general statement.

**suggested_claim_revision**
> Illustrative desk calculation (`simulation_only`) on 40 runs of one generated company: fixing all detected recurring waste adds a median 0.40 months of runway (one-time refunds excluded). Delaying one $15k/month hire by 3 months adds 0.56. Holding AI spend flat adds 0.19, and cutting 10% of discretionary spend adds 0.20. Waste was the largest of these four levers in 0 of 40 runs. The ranking follows from the planted waste size and the chosen hire parameters.

**next_experiments_needed**
- None for the illustration. If it ever becomes a real claim, it would need real ledgers.

**confidence: high** that the numbers are right. **Low** for any generalization beyond this company.

---

### C6. The P10–P90 cash band is miscalibrated

**claim_supported: partial** (the as-generated and hiring-ramp results support it; the revenue-drop and one-off-bill wording is wrong)

**what_results_support**
- From `runway-backtest.md` (reproduced on HEAD; truth is generator cash, not the forecaster):

  | Profile | Horizon | Coverage | Below P10 | Above P90 |
  |---|---|---|---|---|
  | As generated | 3 mo | 59% | | 39% |
  | As generated | 6 mo | 41% | | 56% |
  | Hiring ramp | 3 mo | 7% | 93% | |
  | Hiring ramp | 6 mo | 0% | 100% | |
  | Revenue drop | 6 mo | | 56% (112/200) | |
  | One-off bill | 6 mo | | 76% | |

- As generated, the band is far too narrow: median width 1.4–2.5% of P50, against a nominal 80% coverage. Most misses fall above P90.
- The hiring ramp starts 16 months before ASOF, so it is already visible in history at every origin (6–10 months back). It is a fair test, and the band does not follow the trend.

**what_results_dont_support**
- **"After a revenue drop" / "after a one-off bill" is the wrong timing.**
  - The drop starts 5 months before ASOF and the bill lands 4 months before ASOF. Every origin is 6–10 months back.
  - So both events happen *after* the forecast date, inside the forecast window. The script itself calls the drop "an event no history-based band can foresee".
  - These rows show the band does not cover unforeseen shocks, which is expected of any history-only band. They are not evidence of miscalibration in the same sense as the first two rows.
- **The 200 forecasts per row are not independent.** They are 40 runs × 5 overlapping origins of one company.

**missing_evidence**
- None for the narrowed claim. The draft scopes it to generated history, which is correct.

**suggested_claim_revision**
> On generated history for one company (40 runs × 5 forecast dates), the existing P10–P90 cash band is miscalibrated.
> - It contains realized cash 59% of the time at 3 months and 41% at 6 months, against a nominal 80%. It is very narrow (1.4–2.5% of P50), and most misses fall above P90.
> - When payroll has been ramping for over a year, coverage is 7% and 0%, and realized cash is below P10 in 100% of cases at 6 months.
> - When revenue halves, or a $60k one-off bill lands, after the forecast date, realized cash is below P10 in 56% and 76% of 6-month cases. No history-only band can anticipate such shocks.

**next_experiments_needed**
- None to support the narrowed claim.
- If a recalibrated band is proposed later, backtest it on this same harness with origins after the shock, to separate trend-following from shock coverage.

**confidence: high** for the as-generated and hiring-ramp results. **Medium** for the revenue-drop and one-off-bill framing until it is reworded.

---

### Was the integrity audit reflected?

**Mostly yes.**
- The C3 static check now exists (`tests/grader-offline.test.ts`).
- Dollar amounts are now scored (`heldout-dollars`, `heldout-after-review1`).
- The refund-variant n/a is worded correctly ("wherever something is planted or found").
- The "+31.9%" figure is not used.

**Not yet reflected in the draft:**
1. **C1:** the held-out set's blindness is not evidenced, and there is spec-level leakage. Only the round-1 re-check is mentioned.
2. **C1:** the per-fix ablation was never run.
3. **C2:** part 2 is a consistency check against the same engine.
4. **C5:** the audit's `simulation_only` label ("illustrative" is close, but use the label).

### Summary

| Claim | Supported | Confidence |
|---|---|---|
| C1 | partial | medium |
| C2 | partial | high for runway / medium for agreement |
| C3 | yes as narrowed | high |
| C4 | yes | high |
| C5 | yes as illustration | high for numbers / low beyond it |
| C6 | partial | high, once the shock wording is fixed |

**No number is wrong.** The corrections are about wording:
- the variant counts behind the before-fix ranges;
- what the dollar-accuracy figure measures;
- "clean" vs "unperturbed";
- the timing of the C6 shocks;
- the C3 staleness sentence (it should say both review rounds).

**One real artifact to fix:** the 2/40 false idle-card findings in the `mercury_checking_named_debits` parity layout. They come from how the harness assigns cardholder names, and they are hidden by the part-2 comparison.
