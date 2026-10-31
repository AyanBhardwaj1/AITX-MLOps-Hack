# Plan review, round 1 (fresh same-family reviewer, provisional)

## Prompt

You are a cold, skeptical reviewer. You did not do this work. Read the files yourself; do not trust any summary.

Read:
- Problem anchor: /home/user/AITX-MLOps-Hack/sleep-research/PROBLEM_ANCHOR.md
- Experiment plan: /home/user/AITX-MLOps-Hack/sleep-research/EXPERIMENT_PLAN.md
- Pilot section and chosen idea in /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md
- Pilot code and raw results: /home/user/AITX-MLOps-Hack/src/lib/eval/perturb.ts, /home/user/AITX-MLOps-Hack/scripts/stress-eval.ts, /home/user/AITX-MLOps-Hack/scripts/csv-parity.ts, /home/user/AITX-MLOps-Hack/scripts/portfolio-triage.ts, /home/user/AITX-MLOps-Hack/src/lib/csv/import.ts, and /home/user/AITX-MLOps-Hack/sleep-research/runs/*.md|*.json
- Tracker: /home/user/AITX-MLOps-Hack/sleep-research/EXPERIMENT_TRACKER.md

Answer:
0. Pilot classification check: for each of the 3 pilots, is the classification (positive / positive with limits / refuted) supported by the raw result files? Any pilot code bug that changes the conclusion (e.g., truth construction errors, leakage of post-cutoff data into the "seen" analysis in portfolio-triage.ts, perturbations that make the test trivially pass/fail)? Cite file:line.
1. Which claims (C1–C6) can the planned experiments NOT actually support?
2. Missing baselines or controls a skeptical reviewer would demand?
3. Confounds, leakage risks, or metrics that don't measure the claim? In particular: is C1 at risk of being "decided by construction" (the team writes both the perturbation and the fix)? What would make it honest (e.g., held-out perturbation settings the fixes were not designed against)?
4. What is the single most informative experiment to run first?
Do not add components to the method; risks choose tests, they don't grow the method.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

You may run read-only commands (e.g., `npx tsx scripts/csv-parity.ts`, `npm run stress-eval`) to verify. Do not modify repo files except your trace. Write the prompt you received (under "## Prompt") and your full answer (under "## Response") verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/plan/round1.md, and return the answer as your final message.

## Response

### Verdict

The I5 classification holds. The I15 numbers hold, but the test is mostly a round-trip check, and its stated limits leave out a failure I reproduced. The I1 "refuted" label is not supported: the test could not have passed. C1 as written is decided by construction, and it also fails on `combined` no matter how good the fixes are. The fix for both is held-out test settings, not more method.

### What I checked and found correct

- I re-ran `scripts/csv-parity.ts` and `npm run stress-eval`. Both match the saved `runs/*.json` and `.md` exactly, apart from timestamps. I restored the original files afterwards.
- `npm run eval` is 100/100. `tests/savings.test.ts` and `tests/csv-import.test.ts` pass (26/26).
- The scoring code (`src/lib/eval/score.ts`) and the stress loop (`scripts/stress-eval.ts`) are correct.
- There is no post-cutoff leakage in the triage "seen" analysis. `atCutoff` (`scripts/portfolio-triage.ts:58-63`) keeps only rows dated on or before CUTOFF. It backs cash out using settled, non-credit flows after the cutoff, which is correct: failed and pending rows don't move the balance, and the savings transfer legs net to zero.

### 0. Pilot classifications

**I5 detector stress test, "positive": supported.**

The raw tallies in `runs/stress-eval.json`:

| Setting | Detector | Result |
|---|---|---|
| usage_priced | price_creep | TP 40 / FP 52 (43% precision) |
| split_workspaces | duplicate_charge | TP 40 / FP 1000 (4% precision) |
| split_workspaces | zombie | FN 40 |
| refunded_double_charge | duplicate_charge | FP 40 |

Showing that the detectors break needs no more than this. The mechanisms check out in `src/lib/detect/`:
- **Split workspaces.** The `_ws2` copies are dropped as "same event" by `billingEventsByStream` (`recurring.ts:46-58`). So they are not stream members, and `zombies` (`findings.ts:72-79`) counts them as Priya's "other spend".
- **Refunded double charge.** `duplicateCharges` never looks at credits (`findings.ts:136-164`).

Two caveats matter later, but neither changes this verdict:
- **Each failing setting is one hand-picked vendor with one fixed shape:**
  - `perturb.ts:171-181`: Intercom, Sentry and Vercel, growing 3% a month × U(0.85, 1.15);
  - `perturb.ts:203-211`: an exact copy of every Miro charge;
  - `perturb.ts:214-219`: a Canva refund of exactly the same amount, 6 days later, with the same descriptor and card.
- **The jitter scope was set after seeing results.** The P1a ±4-day model was run, its numbers were discarded, and the jitter was then relabelled a "sensitivity bound" (tracker rows P1a and P1b).

**I15 CSV parity, "positive with limits": the numbers are supported, but the test proves less than the label implies, and the limits are understated.**

Why it is closer to a round trip than to parity evidence:
- **The Rho layout is serialization by construction.** `rho_csv` writes the API's own `transaction_type` into the Type column (`csv-parity.ts:28`), and the importer uses it verbatim (`import.ts:107,120`). The layout is also "our own export shape" (`import.ts:10`), not a verified Rho export.
- **The grader is given the true cash balance** (`csv-parity.ts:45-46`). Runway parity holds only when the founder types the correct cash figure.
- **The descriptors and the import rules were co-designed on the same data.** The generator writes "TRANSFER TO SAVINGS" and "RHO CARD PAYMENT"; the importer regexes (`import.ts:31,33`) were then fixed on this same data after P2a.
- **Only the clean generator was tested.**
- **The comparison leaves out the LLM labels.** It runs against rules-only `analyze()`. The connected product adds LLM labels for unknown vendors (`src/lib/server/data.ts:49-62`). The generator has no unknown vendors, so the gap is invisible here, and the in-browser grader cannot call the LLM without breaking C3.

**New result.** I ran CSV-vs-API parity on every `perturb.ts` setting, comparing CSV findings to API findings, using a scratch script outside the repo.
- Rho- and Mercury-style files match the API exactly in all 12 settings, with runway Δ 0.00.
- **The generic all-accounts layout loses the Confluence/Notion duplicate-tools finding in 40/40 `seat_cards` runs.** Without a cardholder column, Omar's Notion seat merges into Daniel's Notion stream. The 7- and 23-day gaps then break the cadence match.
- **If the seats share one price of $20 or more, generic adds 4 false double charges per run** (Figma, GitHub, Notion, 1Password). `perturb.ts:138` gives each holder a different price ($15–$22), which hides this.

So the stated limit "generic layouts lose idle-card detection" (EXPERIMENT_PLAN C2; IDEA_REPORT:150) is incomplete. The classification should stay "positive", but as a round-trip check on the generator.

**I1 portfolio triage, "refuted": not supported. It should read "inconclusive: the test could not have passed."**

- **The bar was unattainable.** The baseline recall@5 is 95.8%, so +15 points would need 110.8%.
- **The pre-declared early-warning metric excluded nothing.** `pending` is the set of companies with trailing runway ≥ 6 at the cutoff (`portfolio-triage.ts:108`). That was every company except 1 of 900. In `runs/portfolio-triage.json`, crossers equal troubled in 29/30 portfolios, and the early-warning value equals recall@5 in 30/30. The "early warning" result is the same number as recall@5.
- **Recall@5 is saturated.** There are about 9.7 troubled companies per 30, and all 30 share one burn shape. The 5 lowest-cash companies are troubled whatever their profile.
- **The truth labels count the distractor events as burn.**
  - Truth is the trailing runway at ASOF (`:100`), computed from the last 3 complete months, July to September (`runway.ts` `computeSnapshot`).
  - That window contains the one-off bill on 2026-07-15 (`:47`, CUTOFF − 12) and most of the seasonal dip (`:39`).
  - One-off-bill companies are labelled troubled 71/150 times (47%), against 99/420 (24%) for normal ones.
  - The label is the naive metric the composite was built to beat.
- **The composite does carry signal where cash doesn't decide** (scratch diagnostic):
  - Within a matched band of 9–11 months' trailing runway at the cutoff (n = 202, 78 troubled), the composite's AUC is 0.747 against 0.650 for trailing runway.
  - With k set to the number of troubled companies, it ranks 89.3% correctly against 86.6%.
- This does not change the chosen direction, since I1 was gated on advisor demand anyway. But IDEA_REPORT lines 151, 208 and 215 ("refuted in simulation") overclaim.

### 1. Claims the planned experiments cannot support

**C1**
- **It is guaranteed to fail on `combined`.** `combined` (`perturb.ts:256`) includes `unaliased_rename`, which the plan excludes from C1. Under exact-key scoring that rename forces price creep to zero: TP 0, FP 58, FN 40 in `stress-eval.json`. Pre-register the composition of `combined` before running.
- **It cannot support "every realistic setting".** At best it supports "the 10 named settings, applied to one generated company".
- **Without held-out settings it supports only "the fixes repair the cases they were written against"** (see §3).

**C2**
- It supports runway parity on the clean generator, given the true cash balance.
- For `rho_csv` the parity holds by construction.
- It cannot support "reproduces the connected-account" results: the production path adds LLM labels.
- It cannot support the claim on messy ledgers: see the generic `seat_cards` gap above.

**C3** is supportable by the Playwright request log, not by the CSP.
- `connect-src 'self'` (`next.config.ts:12`) allows posts to the app's own server.
- The log must cover the whole session after the file loads, not only "while analyzing".

**C4**
- "Never" is not supportable from two regression cases.
- "Not in the tested cases (unknown cadence, off-feed vendor)" is supportable, and those tests pass.

**C5**
- The "40 baseline companies" are one company shape: 20 seeds × 2 noise levels of the same company, with the same planted waste of about $1.2k/month against about $77k net burn.
- The answer is fixed by the generator's planted amounts. It says nothing about how big SaaS waste is for real companies.
- Fine as an illustration; the README and pitch wording should not rest on it.

**C6**
- The coverage is measured against the team's own data-generating process: monthly noise drawn independently (revenue ±20%, in `demo-company.ts`), which is exactly what the bootstrap assumes (`forecast.ts`), plus a trend the band ignores by design.
- It cannot support "the band covers realized cash" outside the generator.

### 2. Missing baselines and controls

- **C1: a held-out perturbation set** (see §3). The test must be one a vendor allowlist would fail. An allowlist would be "ignore Intercom and Sentry for price creep, Miro for double charges, Canva after a credit". Today's settings would pass one.
- **C1: recall probes where a fix could remove a true finding.** The truth has no real price increase on a growing vendor, and no true double charge next to a recurring repeat or an unrelated partial credit. So "without losing recall" is currently tested only on the clean Datadog step.
- **C2: parity on the perturbed ledgers, CSV findings vs API findings** (not vs truth). Also drop the Type column from `rho_csv`, or name the layout for what it is.
- **C6:**
  - report the band's width next to its coverage, because a wide band covers trivially;
  - also run the backtest on the regime-shift profiles already coded in `portfolio-triage.ts` (revenue drop, one-off bill, seasonal dip).
- **I1, if revisited:** score within matched runway bands, and choose a truth window that does not count the distractor events as burn.

### 3. Confounds and construction

**C1 is at high risk of being decided by construction.**
- The fix authors have the exact failure examples. Each failing setting is one vendor with one parameter set.
- Each detector has one planted instance per company, on the same vendors for every seed. The 40 runs are effectively one company run 40 times, so per-detector recall is close to a single pass/fail event, and the "≥ 90%" threshold is finer than the data can resolve.
- **Fix (a) is the clearest case.** The perturbation models seat growth as smooth. Real seat-priced tools grow in steps as seats are added. A "must be a step change" rule will flag those steps, and bank data alone cannot tell a seat step from a price step. The fix passes only because the perturbation picked the one growth shape it handles.

**What would make C1 honest** (test design only):
1. **Before touching the detectors, write one held-out variant per failure mode.** Ideally a fresh subagent writes them from the plain-language failure description, without seeing the fixes. Commit them, and run them once against the current code to confirm they fail.
   - **Usage-priced tools:**
     - different vendors (e.g. HubSpot, Slack, Notion);
     - growth of 1% and 6% a month, with ±5% and ±25% jitter;
     - recall probes: Datadog with usage growth on top of the planted step, and a +15% real step on a flat vendor;
     - seat steps (one more seat every 3–5 months). These are expected to stay false positives; report them as a stated limit.
   - **Split workspaces:**
     - a vendor that is not on the idle card;
     - the second workspace started 2, 4 or 8 months before asOf;
     - a different amount;
     - a 1-day offset.
   - **Refunded double charge:**
     - the refund 1 or 20 days later, crossing a month end;
     - a refund descriptor that differs (noise prefix or "REFUND");
     - a partial refund, with its truth decided in advance.
2. **Develop the fixes against the three existing settings only.** Run the held-out set once, and report the existing and held-out results side by side. C1 passes only on the held-out results.
3. **Fix the composition and scoring of `combined` in the plan now**, and report `harsh_day_jitter` in the same table, with its exclusion stated as a limit.

**Other confounds**
- C2's descriptors and import regexes were co-designed, and P2b was fixed against the same data it was then scored on.
- C2's runway depends on a correctly typed cash balance; say so in the claim.
- C3's CSP is not evidence that data stays on the device; only the request log is.

### 4. Single most informative experiment

**Write and freeze the held-out C1 perturbation set, then run it against the current, unfixed detectors before writing any fix.** It takes minutes.
- It is the only C1 test whose outcome is not fixed in advance.
- It shows up front which fix (a) failure cannot be fixed from bank data (seat steps), so no effort goes into tuning around it.
- After the fixes, the same frozen set gives the C1 verdict.
