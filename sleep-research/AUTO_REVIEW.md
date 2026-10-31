# Auto review log

Reviewer route: same-family fresh subagent (provisional). Difficulty: medium. Max rounds: 4 (balanced).

## Round 1 — Score 5/10, Verdict: almost

Trace: `traces/review/round1.md`.

Weaknesses (reviewer's ranking) and actions taken:
1. **The grader double-counted card spend for the two-file upload it recommends** (−18% runway); a duplicate file halved runway.
   - *Fixed:* card payoffs are now resolved across all files together (`resolveCardPayoffs`). Duplicate files are ignored, and rows repeated across overlapping exports are counted once, with notes.
   - *Tests:* `tests/grader.test.ts` covers both cases.
   - *Parity:* a new `checking_plus_card_files` layout in `scripts/csv-parity.ts` matches the API exactly (runway Δ 0.00).
2. **The double-charge fix hid real double charges months apart.**
   - *Fixed:* a repeat is suppressed only when it belongs to a detected recurring stream.
   - *Test:* `tests/detect.test.ts`, "still finds two separate double charges months apart".
   - *Stated limit:* 3+ consecutive months of double billing look like a second workspace.
3. **The price-step fix missed staircase raises.**
   - *Fixed:* a two-step fit is accepted at a stricter bar (≤ 0.25 × the line error).
   - *Rejected attempt:* the first try (step test on the last 12 charges) lowered held-out recall on the noisy Datadog step to 85%. It was replaced, so the held-out set has been seen more than once and is now a re-check, not a blind test.
   - *Test:* "finds the latest raise in a staircase".
4. **The seat-jump limitation was dropped from the README.**
   - *Fixed:* findings now read "bill up X%" with "If you didn't add seats…". The README states the limit.
5. **The Rho/Mercury layouts were presented as real exports**, Mercury `Failed` rows were imported, and inverted signs went unnoticed.
   - *Fixed:* rows that didn't complete are skipped and a mostly-positive file is warned about.
   - *Wording:* README and page now say "Rho-/Mercury-*style* layouts, untested on real exports".
6. **Minor:**
   - Ranking now uses first-year value (12 × monthly + one-time).
   - The README contradiction and test count are fixed.
   - The C1 ablation is still **not run** (stated).
   - The held-out 100% is 15 effectively-single checks (stated in claims).

Results were re-run on the current code: `runs/stress-eval.*`, `runs/heldout-after-review1.*`, `runs/csv-parity.*`, `runs/runway-levers.*` and `runs/portfolio-triage.*`. The eval stays at 100/100 and 367 tests pass.
