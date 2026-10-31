# Review loop, round 1

## Prompt

[Round 1/4 of an autonomous review loop]

Review the work from its artifacts. Executor notes are not evidence; read the files yourself (repo root /home/user/AITX-MLOps-Hack):
- Claims / plan: sleep-research/EXPERIMENT_PLAN.md (claims C1–C6, as amended), sleep-research/PROBLEM_ANCHOR.md, sleep-research/IDEA_REPORT.md (Pilots, Chosen idea), README.md sections "Stress test on ledger shapes…" and "Known limitations"
- Code: src/lib/detect/findings.ts, src/lib/detect/recurring.ts, src/lib/csv/import.ts, src/lib/grader.ts, src/components/grader-panel.tsx, src/app/grader/page.tsx, src/lib/agent/inbox-order.ts, src/lib/eval/perturb.ts, src/lib/eval/heldout.ts, scripts/*.ts, tests/detect.test.ts, tests/csv-import.test.ts, tests/grader*.test.ts
- Raw results (verbatim files): sleep-research/runs/* (stress-eval, heldout-before-fixes, heldout-after-fixes, heldout-dollars, csv-parity, runway-backtest, runway-levers, portfolio-triage, grader-privacy)
- Audit and earlier reviews: sleep-research/EXPERIMENT_AUDIT.md, sleep-research/traces/plan/round1.md, sleep-research/traces/triage/round1.md, sleep-research/traces/heldout/author.md
- Changes over the run: `git log --oneline ed11393..HEAD`

Act as a senior reviewer for a product-research venue judging whether these product changes are well-founded and the claims honest (think: an experienced fintech operator + an ML evaluation reviewer). Start from the assumption that the work is broken somewhere and find where. You may run read-only commands (npm test, npm run eval, npm run stress-eval, npx tsx scripts/…; restore any overwritten files under sleep-research/runs with `git checkout -- sleep-research/runs` afterwards).
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

Write the prompt (under "## Prompt") and your full response verbatim (under "## Response") to /home/user/AITX-MLOps-Hack/sleep-research/traces/review/round1.md. Do not modify other repo files. Return the response as your final message.

## Response

### What I checked and what holds

I re-ran things myself rather than trusting the tracker:
- `npm test`: 28 files, 360 tests pass.
- `npm run eval`: 100/100 on every detector.
- `npx tsx scripts/heldout-eval.ts` (temporary label, deleted afterwards): the table matches `runs/heldout-dollars.md` exactly.
- `npm run stress-eval`: only `generatedAt` changed, and I restored the file.

These parts are sound:
- `heldout.ts` has one commit (`cfec0db`).
- H0 really ran on unfixed code.
- The author trace exists.
- Scoring uses exact keys against generator truth, with no truth derived from detector output.
- The backtest (C6) and the levers calculation (C5) are reported honestly, unflattering numbers included.
- C3 is supported for one session, plus the static import walk.
- C4 holds.

The research process is unusually careful. The problems are in what it didn't probe: the new rules make the product wrong in cases nobody tested. I wrote small probes (scratch scripts, not committed), and the same probes run against the pre-fix tree (`git archive bd2c27b`) give the before numbers.

### Critical weaknesses, most severe first

**1. The grader's recommended upload gives a runway about 2 months short, plus a false note.**
- **Where:**
  - `src/components/grader-panel.tsx:78` tells users "Add your card's export too".
  - `src/lib/grader.ts:46-56` imports each file separately.
  - `src/lib/csv/import.ts:159` therefore decides `cardSpendAsPayoffs` per file. Checking-account card payoffs become spend even though the card's own rows are in the second file, so card spend counts twice.
- **Measured** (seeds 1/38/75/112/149, generic and Mercury layouts give the same result):

  | | Seed 1 | Seed 38 | Seed 75 | Seed 112 | Seed 149 |
  |---|---|---|---|---|---|
  | API runway (months) | 11.20 | 11.51 | 11.32 | 11.67 | 12.07 |
  | Grader, checking + card files | 9.16 | 9.54 | 9.32 | 9.66 | 9.97 |

  That is about −2.0 months (−18%). The page also says "the card's own transactions weren't uploaded", which is false: they were.
- **Same file uploaded twice:** runway drops from 11.20 to 5.60 with no warning.
- **Why the tests missed it:** C2 (`scripts/csv-parity.ts`) only tests a single combined file, and the privacy check used one file. So the README:39 promise (any bank export, add your card) rests on an untested path, and that path is wrong.
- **Minimum fix:**
  - Decide the payoff handling once across all uploaded files in `gradeCsvFiles`.
  - Add a "checking file + card file" layout and a "same file twice" case to `csv-parity.ts` or `tests/grader.test.ts`.
  - Warn when two files repeat the same rows (same date, description, amount and account).
  - Until then, narrow C2 to "one combined export".

**2. The double-charge fix silently drops real double charges.**
- **Where:** `src/lib/detect/findings.ts:183-190`. It counts same-card pairs per vendor, account and cardholder across the whole history, with no cadence check, and suppresses all of them once there are 2.
- **Probe:** two separate Notion double charges about 6 months apart on Daniel's card. Found: unfixed code 80/80, HEAD 0/80.
- **Why it matters:** this is the highest-confidence detector (0.9), and a vendor that double-bills once tends to do it again.
- **Who asked for this test:** the plan reviewer asked for exactly this kind of recall probe ("no true double charge next to a recurring repeat", `traces/plan/round1.md:134`). Neither the held-out set nor the dev set has one.
- **Minimum fix:**
  - Suppress only when the repeats form a recurring stream. Reuse the `#2` stream that `recurring.ts:65-67` already builds and that must pass `matchCadence`.
  - Add the months-apart probe as a new recall test.
  - State the case that truly can't be separated as a limit: two *consecutive* months of double billing look exactly like a second workspace that started then.

**3. The price-step test misses staircase price increases.**
- **Where:** `src/lib/detect/findings.ts:118-134` and `:148`. The step-vs-line test runs over the whole history, so two raises read as a trend.
- **Probe:** Slack +20% 12 months before asOf, then +20% again 4 months before ($480 → $576 → $691). Flagged: unfixed code 40/40, HEAD 0/40. The latest raise alone (+20%, +$115/mo) clears every threshold.
- **Why it matters:** yearly list-price increases are the common case for price creep. Together with #2, this disproves "restores ≥ 90% precision without losing recall" (`PROBLEM_ANCHOR.md:4`; IDEA_REPORT "no recall loss") outside the tested shapes. The held-out set checked only the three failure modes the fixer named, never what the fixes might break.
- **Minimum fix:**
  - Accept a step when the most recent change point passes the test on the charges since the previous level (or on the last ~12 charges).
  - Add the staircase as a recall probe.
  - Re-run eval, stress-eval and held-out, all of which should stay 100/100.

**4. A known limit was dropped from the README; seat growth reads as a price increase.**
- **Probe:** Slack goes from 12 to 16 seats 4 months ago, with no price change. Result: "Slack price up 33% … Negotiate back or downgrade the plan" in 40/40 runs.
- **Background:** the plan registered this limit in advance (EXPERIMENT_PLAN C1, "expected exception"). The held-out seat variant passed only because it adds one seat (under 10%) at a time, which a straight line fits. The audit then advised reporting the limit as "did not occur", and the README's stress-test limits leave it out.
- **Why it matters:** to a founder who just hired, a "price up" claim with "negotiate back" damages trust.
- **Minimum fix:**
  - Add one README sentence: a single large seat jump is reported as a price increase.
  - Change the finding copy to "bill up X% (price or seat change)".

**5. The Rho and Mercury layouts are our own guesses but are advertised as real.**
- **Where:**
  - `src/lib/csv/import.ts:11-12` marks the Mercury columns `UNVERIFIED`, and the Rho layout is "our own export shape" (`:10`).
  - README:39 and `src/app/grader/page.tsx:7` say "Drop your Rho, Mercury or bank CSV export".
- **Concrete defects:**
  - The Mercury layout includes a Status column, but the importer never reads it (`import.ts:101-139`). Adding one `Failed` Figma row makes "Figma charged twice" a top finding.
  - There is no sign-convention check. A card export that lists charges as positive amounts turns spend into income: the grader finds $0 waste and shows the same false "card not uploaded" note.
- **Minimum fix:**
  - Skip rows whose Status isn't a completed state.
  - Warn when most rows in a file are positive.
  - Say on the page and in the README that the Rho and Mercury layouts haven't been checked against real exports.

**6. Minor items, each fixed with a sentence or a line:**
- **Ranking mixes monthly and one-time dollars** (`src/lib/agent/inbox-order.ts:9`, `src/lib/grader.ts:86`). A $120 one-off ranks above a $57/month tool ($684/year). Annualize the monthly figure, or say "monthly + one-time" in the UI.
- **README contradicts itself.** :40 ships "Inbox ordered by what's at stake", while :203 lists "Inbox ranking … by dollar impact" as not built. :110 says "150 unit tests"; there are now 360.
- **The planned C1 ablation (EXPERIMENT_PLAN "Ablations") was never run.** Run it, or strike it from the plan.
- **For readers of the C1 table:** the held-out 100% is about 15 pass/fail events, because each variant plants one item on the same vendors in every seed. The README's framing as "one generated company shape" is right; don't let a "600 runs" reading creep in.

### Verdict reasoning

The claims as worded are mostly honest, and the evidence chain (frozen held-out set, audit, reproduction) is real. But the work's own goal was trustworthy findings and a correct runway from a CSV. On the grader's recommended input, the runway is about 18% wrong. Two of the three fixes trade away recall on common, untested shapes (repeat double charges, yearly price raises). All the fixes above are small and local (a cross-file payoff decision, a cadence check, a recent-window step test, a few probes, and a few README sentences), so this is "almost", not "not ready".

Score: 5/10
Verdict: almost
