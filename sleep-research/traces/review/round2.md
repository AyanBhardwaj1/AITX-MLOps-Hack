# Review loop, round 2

## Prompt

[Round 2/4 of an autonomous review loop]

Review the work from its artifacts. Executor notes are not evidence; read the files yourself (repo root /home/user/AITX-MLOps-Hack):
- Claims / plan: sleep-research/EXPERIMENT_PLAN.md (claims C1–C6, as amended), sleep-research/PROBLEM_ANCHOR.md, sleep-research/IDEA_REPORT.md (Pilots, Chosen idea), README.md ("What it does", "Stress test on ledger shapes…", "Known limitations")
- Code: src/lib/detect/findings.ts, src/lib/detect/recurring.ts, src/lib/csv/import.ts, src/lib/grader.ts, src/components/grader-panel.tsx, src/app/grader/page.tsx, src/lib/agent/inbox-order.ts, src/components/inbox-panel.tsx, src/lib/eval/perturb.ts, src/lib/eval/heldout.ts, scripts/*.ts, tests/detect.test.ts, tests/csv-import.test.ts, tests/grader*.test.ts
- Raw results: sleep-research/runs/* (stress-eval, heldout-before-fixes, heldout-after-fixes, heldout-after-review1, heldout-dollars, csv-parity, runway-backtest, runway-levers, portfolio-triage, grader-privacy)
- Audit and earlier reviews: sleep-research/EXPERIMENT_AUDIT.md, sleep-research/traces/review/round1.md, sleep-research/AUTO_REVIEW.md (what was changed in response)
- Changed since last round: `git diff b87125e..HEAD` (round-1 fixes)

Act as a senior reviewer judging whether these product changes are well-founded and the claims honest (an experienced fintech operator + an ML evaluation reviewer). Start from the assumption that the work is broken somewhere and find where. Specifically check whether the round-1 weaknesses were genuinely fixed or merely sidestepped, and whether the fixes introduced new regressions (re-run probes for each: two-file grader upload, duplicate file, separate double charges months apart, staircase raises, seat jump wording, Mercury Failed rows, inverted signs). You may run read-only commands (npm test, npm run eval, npm run stress-eval, npx tsx scripts/…, small throwaway scripts outside the repo); restore any overwritten files under sleep-research/runs with `git checkout -- sleep-research/runs` afterwards.
1. Score 1-10
2. Remaining critical weaknesses, ranked by severity (cite file:line or file + value)
3. For each, the MINIMUM fix (experiment, analysis, or reframing)
4. Verdict: ready / almost / not ready
Output exactly one line "Score: X/10" and one line "Verdict: ...".
If, after genuinely trying to break it, the work holds up, say so clearly.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write the prompt (under "## Prompt") and your full response verbatim (under "## Response") to /home/user/AITX-MLOps-Hack/sleep-research/traces/review/round2.md. Do not modify other repo files. Return the response as your final message.

## Response

### How I checked

I re-ran everything myself:
- `npm test`: 367 tests pass.
- `npm run eval`: 100/100.
- `scripts/heldout-eval.ts` with a temporary label (file deleted afterwards): the table is identical to `runs/heldout-after-review1.md`.
- `csv-parity` and `stress-eval`: only `generatedAt` changed. I restored both with `git checkout -- sleep-research/runs`.

I then probed each round-1 item with throwaway scripts in the scratchpad. Each probe ran on HEAD and on the pre-fix tree (`git archive b87125e`).

### What was genuinely fixed

- **Two-file grader upload.** Three file combinations gave the same runway as the API path to 0.00 months on seeds 1/38/75/112/149: generic checking + Mercury card, generic + generic, and Mercury + Mercury. The false "weren't uploaded" note is gone.
- **Duplicate file.** Uploading the same file twice gives the API runway, with an "ignored" note. Re-exporting the same data with a trailing newline (different bytes) is handled by row de-duplication and also gives the right runway.
- **Separate double charges.** Found on HEAD, missed by the old code in every case:

  | Gap between double charges | HEAD | Old code |
  |---|---|---|
  | 6 months | 20/20 | 0/20 |
  | 2 months | 20/20 | 0/20 |
  | 2 consecutive months | 20/20 | 0/20 |
  | Months 1, 5 and 9 | 30/30 | 0/30 |

- **Staircase raises.** Two-raise staircases (480 → 576 → 691, at several timings, and with 2% noise) are caught 200/200 on HEAD, against 0/200 before.
- **Mercury `Failed` rows** are skipped.
- **Finding copy** now reads "bill up X% … If you didn't add seats".
- **Inbox ranking** uses first-year value.
- **Disclosure.** The note that the held-out re-check is no longer blind is honest and well placed.

### Remaining weaknesses, most severe first

**1. New regression: one named card row makes the grader drop all credit-card spend, overstating runway by about 28%.**
- **Where:** `src/lib/csv/import.ts:157`
  ```ts
  const cardRowsPresent = transactions.some((t) => t.user_full_name) || payoffs.some((t) => t.amount.amount > 0);
  ```
  Any row with a name on card now counts as proof that the card's own rows were uploaded.
- **Probe:** a Mercury-style checking-only export with a few debit-card purchases carrying a name on card (Mercury debit cards draw on checking), plus the usual credit-card payoffs.

  | Seed | API runway | HEAD | Old code |
  |---|---|---|---|
  | 1 | 11.20 | 14.37 | 11.17 |
  | 38 | 11.51 | 14.53 | 11.52 |
  | 75 | 11.32 | 14.35 | 11.29 |

  On HEAD the "card not uploaded" note also disappears. The runway is now wrong in the dangerous direction (more months than the company has), and nothing on the page signals it.
- **Why the parity check missed it:** the `checking_plus_card_files` layout (`scripts/csv-parity.ts:28`) always pairs checking with a Mercury card file that has cardholders, so the short-circuit hides the problem.
- **Minimum fix:**
  - Drop the `user_full_name` clause and decide only from the incoming payoff leg, across all files (which was the point of round 1).
  - I tested this one-line change in a scratch copy. It restores 11.17/11.52/11.29 on this probe and keeps every two-file and duplicate-file probe at 0.00 error.
  - Add a "Mercury checking-only with debit-card rows" layout to `csv-parity.ts`.
- **Residual after the fix:** a generic card file (no cardholder column) whose payment row doesn't match `CARD_PAYOFF_PATTERN` (e.g. "PAYMENT - THANK YOU" with a dash) still double-counts by about 18%. It also shows the false "weren't uploaded" note.
  - Probe: generic checking + generic card with no payoff row gives 9.16 against 11.20.
  - Minimum fix: when more than one file was uploaded, change that note to say "if one of these files is your card's export, its spend is being counted twice."

**2. Exports of the same account split into two files lose real findings.** This bug predates round 1, but it now sits inside the round-1 "overlapping exports" claim.
- **Where:** `src/lib/csv/import.ts:134` builds ids as `csv_${account}_${rowNo}`, and for Mercury and Rho layouts `account` comes from the file's own column. Two exports of the same account therefore reuse ids: in one probe, 983 rows produced only 709 unique ids. The detectors key on ids (`txnsById`, `recurring.has(t.id)`, `subscriptionIds`), so colliding ids replace amounts and suppress repeats.
- **Probe:** the same Mercury account exported as two date ranges.

  | Upload | Effect | Monthly waste found |
  |---|---|---|
  | One file | (reference) | $2,570 |
  | Two consecutive halves | Datadog +$1,200/mo increase and Canva double charge dropped in 5/5 seeds | $1,370 (−47%) |
  | Two overlapping ranges | Same losses in 3/5 seeds | $1,370 in those seeds |

  The pre-fix tree behaves the same way, so this is not a regression.
- **Why it matters now:** the new note "N rows repeated across overlapping exports were counted once" tells the user the overlap case is handled. The grader test only covers byte-identical files (`tests/grader.test.ts:66`), which take the duplicate-file path and never reach row de-duplication.
- **Minimum fix:**
  - Include the per-upload `accountId` in the id. I checked this in a scratch copy: halves and overlap then match the single file on all 5 seeds.
  - Add a two-date-range Mercury case to `tests/grader.test.ts`.

**3. The staircase fix (two-step fit) multiplies false "bill up" findings when growth starts after a flat period.**
- **Where:** `src/lib/detect/findings.ts:134-137`, the two-step branch at `TWO_STEP_FIT_RATIO = 0.25`. Probes ran on a Notion-like $480 subscription, 24 monthly charges, 200 trials each.

  | Shape | HEAD | Old code |
  |---|---|---|
  | Flat 12 months, then +2%/mo, 2% noise | 57/200 | 6/200 |
  | Flat 12 months, then +4%/mo, 2% noise | 72/200 | 0/200 |
  | 12 seats flat for 12 months, then +1 seat every 2 months | 200/200 | 0/200 |
  | Smooth linear, exponential or S-curve growth | 0/200 | 0/200 |
  | Flat 16–18 months, then +4%/mo | ~200/200 | ~200/200 |

  Late-starting growth was already a false positive in the old code. Hinge-shaped growth (flat, then hiring after a raise) is common, and it is the original "growth read as a price increase" failure mode. Neither the held-out set nor the README limits cover it; the README only names "a single large seat jump".
- **Recall gap:** three raises within 24 charges are still missed (0/200).
- **Mitigation already in place:** the new copy ("If you didn't add seats") softens the damage.
- **Minimum fix:**
  - Add one README limit: "growth that starts after a flat period (e.g. hiring after a raise) is reported as 'bill up'".
  - Add the hinge shape as a negative-control probe and report its rate.
  - Do not claim the C1 precision beyond the 15 held-out shapes.

**4. Double charges about 3 or 12 months apart are still hidden.**
- **Probe:** two double charges about 3 months apart found 0/20, and two about 12 months apart found 0/20.
- **Cause:** two repeats form a 2-occurrence quarterly or annual `#2` stream in `recurring.ts:64-66` / `CADENCES`, and `findings.ts:194` then suppresses them. The README limit names only "three or more consecutive months".
- **Minimum fix:** either state it ("…or two double charges about a quarter or a year apart"), or count a repeat as a second workspace only when its `#2` stream has the same cadence as the main stream.

**5. AUTO_REVIEW says a fix was made that wasn't.**
- **The claim:** `sleep-research/AUTO_REVIEW.md` says "README *and page* now say 'Rho-/Mercury-style layouts, untested on real exports'".
- **The page is unchanged:**
  - `src/app/grader/page.tsx:7` still says "Drop your Rho, Mercury or bank CSV export".
  - `src/components/grader-panel.tsx:78` still says "Rho, Mercury or any bank with Date, Description and Amount columns".
  - Only the README changed.
- **Minimum fix:** edit the two strings, or correct the log.

**6. An inverted-sign file is warned about, but the same result shows contradictory false notes.**
- **Probe:** generic checking plus a card export with charges as positive numbers. Runway is 14.40 against 11.20, and waste is $0. The notes say:
  - "card's own transactions weren't uploaded" (false);
  - "24 rows repeated across overlapping exports were counted once" (false: the flipped card payoff now matches the checking payoff's key, and row de-duplication drops it);
  - the inverted-sign warning, listed fourth.
- **Card file alone:** runway reads "Infinity".
- **Minimum fix:** when any file is flagged as mostly positive, show that warning first and leave out the payoff and overlap notes for that upload.

**7. Minor items, one line each:**
- **Seat jump outside the findings:** the weekly alert and Monday digest still say "Slack price went up 33%" (`src/lib/insights/changes.ts:129`), and the dashboard label is "Price increase" (`src/components/dashboard.tsx:67`). Apply the same "bill up" wording.
- **Tracker figure:** H3 in `EXPERIMENT_TRACKER.md` says the noisy-Datadog dollar figure is 93%; the run file says 92%.
- **Stale plan text:** EXPERIMENT_PLAN C2 still says "4 layouts".
- **Unqualified claim:** `PROBLEM_ANCHOR.md:4` still says "without losing recall" with no scope. Qualify it as "on the tested shapes".

### Verdict reasoning

Most round-1 items were genuinely fixed, not sidestepped, and the probes confirm it. The held-out and parity results reproduce exactly, and the disclosures are honest.

The remaining problem is narrow but serious for a runway product. The cross-file payoff fix added a shortcut that, on a realistic checking export, silently overstates runway by about 3 months. Separately, splitting one account's export into two files drops the largest finding. Both fixes are one line each, and I checked both in a scratch copy. The rest is wording, plus two stated limits on the detectors.

Score: 6/10
Verdict: almost
