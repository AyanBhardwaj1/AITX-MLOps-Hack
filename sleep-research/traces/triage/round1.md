# Triage round 1 — independent reviewer

## Prompt

You are a cold, independent reviewer (a skeptical senior product/fintech investor-operator). You did not do this work. Read the files yourself; do not trust any summary.

Files:
- Annotated candidate set and landscape: /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md (sections "Brief", "Literature landscape", "Candidate pool")
- Raw candidate shards with hypotheses, MVEs and evidence: /home/user/AITX-MLOps-Hack/sleep-research/traces/ideas/*.json
- The product as built: /home/user/AITX-MLOps-Hack/README.md
- Prior market research notes (sources for the landscape): /home/user/AITX-MLOps-Hack/research_notes/Runway product go to market/*.md

Task A (landscape gate): spot-check 5 factual statements in the "Literature landscape" section against the research notes. For each, say SUPPORTED / UNSUPPORTED / OVERSTATED with the note line. Give an overall PASS/WARN/FAIL for the landscape.

Task B (triage): Each idea carries prior_work, so_what, and effort notes. For each of the 18 ideas, make the strongest case both ways in 1-2 lines each:
- Best case FOR it: what would make this the wedge that gets Runway paying users?
- Strongest objection an investor or experienced operator would raise
- Most likely failure mode
- Is the prior_work note a real "already done" problem, or differentiable?
Then rank by expected information and upside within a pilot budget of a few hours of local simulation, and name the 2-3 you would actually pilot, and why. Also say which ideas are prerequisites/hygiene that should simply be built regardless (e.g., fixing a real defect) versus bets that need a pilot.

Rank; do not rewrite. An objection is answered or recorded as a named risk, never absorbed by adding a module or qualifier. Complexity added since the brainstorm is a red flag. If your picks are all LOW risk, name the high-upside idea that most deserves a pilot slot and what result would convince you.

Remember: the sandbox has no real users; pilots are simulations on a synthetic generator, so they can establish whether a mechanism works "in simulation", not whether users will pay. Weigh ideas accordingly.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write your full response verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/triage/round1.md (prefix it with the prompt you received under a "## Prompt" heading and your answer under "## Response"), and also return it as your final message. Do not edit any other files.

## Response

### Task A — Landscape gate: **WARN**

The landscape copies the facts accurately. The trouble is in the implications and gaps. Three times, "not found in search" turns into "does not exist", and low-end alternatives that the notes name are left out. That matters because the prior_work notes for I1, I15 and I16 rest on those gaps.

| # | Landscape statement | Verdict | Note line |
|---|---|---|---|
| 1 | "Mercury Insights (Mar 2026): AI cash-flow alerts and chat." | **SUPPORTED** | competitors.md:22 ("announced as live in the dashboard in March 2026 … AI cash-flow alerts and a chatbot"); retention_features.md:18. Minor issue: the landscape lists it as a "verified" fact, but both sources are Mercury's own blog, and competitors.md:49 says the fetch of mercury.com failed. So the two excerpts are not independent. |
| 2 | "Ramp … 85K+ customers." | **SUPPORTED** | competitors.md:19 ("more than 85,000 customers as of 2026-10-01"), repeated at :135. |
| 3 | "Finance leaders rarely fully trust AI (14% full trust, Esker Sept 2026); 90% require human approval (Medius)." | **SUPPORTED** | retention_features.md:48 (Esker, Sept 2026, 14% fully trust) and :50 (Medius, 90% require human approval). |
| 4 | "Implication: sub-50-person teams without SSO are unserved." | **OVERSTATED** | competitors.md:64 names Cledara ("from about $75 a month … the most startup-friendly option"). competitors.md:70 says "Cledara and Ramp are the realistic alternatives at the low end." Accurate wording would be "underserved by SSO-based tools", not "unserved". |
| 5 | G3: "The fractional CFO serving 10–30 startups has no cheap multi-client, bank-native monitoring tool; Fathom and Jirav are GL-based." | **OVERSTATED** | icp_pricing_distribution.md:101: Rho itself runs "an accounting/CAS firm partner program **with multi-client tooling** (rho.co/accountants)". retention_features.md:80 lists Jirav (~$50/client wholesale), Fathom, Spotlight and Syft as incumbents. The notes never say "GL-based" (it is plausible background knowledge). Leaving out Rho's own multi-client tooling is the important gap, because Rho is Runway's only data source. |

Other issues found while checking (not counted among the five):
- **G1 ("No product verifies that savings actually landed") is OVERSTATED.** retention_features.md:107 says "No evidence was found … (it may exist inside Ramp/Zylo deprovisioning flows)", and :88 rates the external evidence "Weak". The landscape drops that hedge. Also, Runway's shipped verifier has a confirmed false-verify defect (see I6), so "Shipped in Runway already" is only partly true.
- **Its own [UNVERIFIED] rule isn't applied.** The landscape says single-aggregator prices are `[UNVERIFIED]`. But it states "Zylo, Tropic and Spendflo cost $10K–$200K+/yr" untagged, even though competitors.md:62–66 marks those figures as third-party or "(unverified)". "Rho read-only API open to all customers since Jul 2026" rests on "One comparison says" (competitors.md:36). The range itself does match the notes.
- **Blaze is missing from the gaps.** competitors.md:104 calls Blaze (YC, Plaid-connected recurring detection plus runway projection) "the closest functional clone of this product". The landscape names Blaze but uses it in no gap or prior_work note, and no shard mentions it. Any "no bank-native tool found" claim (I1, I2, I8, I12) should be checked against Blaze first.
- **Seed → A "about 2.2 years" quotes the larger number.** icp_pricing_distribution.md:16 gives 2.2 years and also a Carta figure of 616 days (~20 months). Both are secondary. This is minor.
- **Weak evidence behind several prior_work notes.** The shards cite 8 distinct `*.pages.dev` sites (e.g. metricrig, kefiw, nosavenopay, burnrateos-frontend, finsightly-landing) as evidence. These look like generated SEO pages. "None found" verdicts that came from searches surfacing such pages deserve low confidence.

Correct as stated: Productiv shutdown (competitors.md:60, three sources), Vertice–Vendr (:59), the Capital One–Brex close (:30, SEC 10-Q), the cfo.ai rebrand and pricing (:80, :84), Rho hiring an accounting-partnerships lead (icp:102), and Mercury ~300K customers (icp:31).

### Cross-cutting findings that drive the ranking

1. **Most pilots are decided by construction.** The same team writes the generator perturbation and the fix, so many MVEs detect exactly the effect they inject:
   - I2 and I8: inject a trend, then a trend-aware model wins.
   - I9: AI spend at 25%/month compounding changes runway.
   - I11: sample software at 2–8% of burn, and waste comes out small.
   - I13: invent a Poisson arrival rate for new waste, and get that rate back.
   - I3: scale planted waste, then count companies that clear 3×$79.
   - I17: set the facility, and the lead time follows.

   These carry little information. The pilots that are informative measure **existing code against inputs it was not tuned on**: I5, I6, I15, and the base-method part of I2.
2. **The generator has one shape.** `generateDemoCompany` takes only `seed`, `asOf`, `months` and `noise` (demo-company.ts:101), and docs/eval-results.md reports "100.0% ± 0.0" across all seeds. The seeds do not vary the company, so the 100% headline is one company scored ten times.
3. **The base company has 6 planted findings worth ~$2.57K/mo**, and Datadog's $1,200 is about half of it (demo-company.ts:228–235). Any idea about ranking, batching or materiality (I4, I13) works on a backlog that empties in under two weeks at 3 approvals a week.
4. **The confirmed defect (I6) undercuts every savings-anchored idea (I3, I13, the G1 claim).** A pricing or ROI story must not rest on the current verifier.
5. **There is no self-serve connect path today.** The README describes one shared password, a single Rho token from env, and no partner OAuth, Supabase Auth or Mercury connector. Every acquisition idea (I1, I7, I15, I16) is limited by this. It is a named risk for all of them, not something any one idea can fix.

### Task B — per-idea triage

**I1 Advisor / fractional-CFO console** (W/M, acquisition)
- FOR: one sale brings 10–30 orgs. Rho is hiring an accounting-partnerships lead (icp:102), and the schema already has org_id/RLS. This is the only idea with an acquisition multiplier.
- Objection: Rho already runs accountant multi-client tooling (icp:101), so Runway competes with its own data supplier. Advisors bill for GL deliverables (close, board pack), so a bank-only monitor is an add-on to Fathom/Jirav/Syft at ~$50/client.
- Failure mode: the ranking passes in simulation (shocks are injected through the score's own inputs), but a CFO's book has only 2–3 Rho-banked clients, and each must grant a partner-OAuth connection that does not exist yet. "W" understates the auth work.
- prior_work: partly a real overlap (Rho's own tooling, scope unknown). Differentiable on waste plus runway triage, but that must be desk-checked before building.

**I2 Backtested, trend-aware runway** (D/L, trust)
- FOR: a published track record ("our band held 8 of 10 times") is the one thing a free bank runway number lacks. The README already admits the band misses trends.
- Objection: a seed company with 12–24 months of history gets 3–9 backtest points, so its "accuracy" figure is itself noise. Founders don't pay for error bars.
- Failure mode: the trend-aware variant wins only on injected trends, and a fitted drift on 12 months of data widens or destabilises the band on real feeds.
- prior_work: differentiable (no one publishes runway error), but this is retention and trust hygiene, not a wedge. The informative part is cheap: backtest the **existing** method on the base generator plus one modest hiring step.

**I3 Price on verified savings** (D/M, monetization)
- FOR: removes the willingness-to-pay objection, and is the only pricing story that uses Runway's distinctive verification.
- Objection: the verifier false-verifies today (I6), so billing on it is a liability. Waste front-loads into a first cleanup, so revenue falls off after month 1–3. With the cap at one third of savings, seed-scale waste (~$950–2,600/mo, icp:36) gives a $79 plan with a free gate anyway.
- Failure mode: the simulation says "most clear 3×$79" because planted waste is ~$2.5K/mo by construction, which says nothing about willingness to pay.
- prior_work: real precedent (Rocket Money; Vertice's guarantee; NoSaveNoPay at 25% of verified savings, icp:70). Differentiable only through bank-native verification. Decide this at a desk after I6 is fixed; no pilot.

**I4 Inbox ranked for approval fatigue** (D/L–M, trust)
- FOR: approval fatigue is documented (93% of prompts approved, retention_features:52), and the README already lists Inbox ranking as next.
- Objection: with ~6 findings, one of them half the dollars, every ordering clears the backlog within weeks. The annual-renewal cliff is already shown by the renewals calendar. "Calibrated confidence" depends on I5 data that does not exist yet.
- Failure mode: under 5% difference between orderings, or a difference that depends only on how many annual cliffs were planted.
- prior_work: differentiable but trivial. **Sorting by dollar impact is a few lines; just do it.** The EV and cost-of-delay model is complexity added since the brainstorm (two shards merged); park it.

**I5 Detector stress harness + calibrated confidence** (D/L, trust)
- FOR: every pitch number, the README's 100% table, and any savings price depend on detectors that have only seen one company. G6 is the largest unknown the sandbox can actually shrink.
- Objection: the perturbations are still the team's own inventions. Passing them shows robustness to imagined shapes, not to real ledgers; only one real export can do that.
- Failure mode: a harness tuned until it passes, or one that grows into a framework. Also expect a predictable result: with every tool on one founder card, zombie recall falls to 0 by design. That is a product limitation to state, not a bug.
- prior_work: not applicable (own eval); this is hygiene with real information value. Cut the "calibrated confidence / OOD ask-the-owner" half until the measurement shows failures.

**I6 Harden savings verification** (D/L, trust) — **confirmed defect**
- I reproduced two false "verified" paths in `src/lib/insights/savings.ts` with a throwaway vitest probe (since deleted; no repo files changed):
  - (a) An annual tool with **one** prior charge on that card is assumed to bill monthly (`gapDays` defaults to `AVG_DAYS_PER_MONTH`, line 91). For DocuSign $600 paid 2025-12-02, accepted 2026-01-10, it reads **"verified" at asOf 2026-03-01**, though the next real bill is ~2026-12.
  - (b) A target vendor with **no charges in the feed** reads "verified" the next day, because `outcomes.every(...)` on an empty list is `true` (line 153).
  - The shard's stated mechanism ("nextExpected null → verified", line 104) is the narrowest of the three paths: it needs the card's first charge to land inside the 7-day in-flight window.
- Does it arise here? The 24-month demo gives its annual tools (DocuSign, Carta) two charges each, so the demo is fine. Any real account with under ~13 months of history on an annual tool, or a tool adopted this year, hits (a).
- FOR: savings verification is the core trust claim and the anchor for every savings-based price.
- Objection: none against fixing it. The shard's descriptor-similarity "successor charge" search is added machinery; skip it until a test shows it is needed. Off-feed moves cannot be seen from one feed at all, so record that as a named limitation ("verified = stopped charging on this account").
- prior_work: none; this is hygiene. **Build regardless, with regression tests; no pilot.**

**I7 Investor live card + portfolio watch** (W/H, acquisition)
- FOR: investors as a distribution channel; Visible averages ~57 recipients per update; the investor-update generator already exists.
- Objection: adverse selection. Healthy companies share; troubled ones, the cases the watch exists for, switch it off. Fund-paid licences are a slow enterprise sale, and Visible and Carta already hold the investor relationship.
- Failure mode: founders won't share bank-derived numbers. The simulation can only check that figures match (guaranteed, since it is the same function) and the lead time on injected shocks (tautological).
- prior_work: a real "already done" problem (Visible, Carta, portfolio-monitoring tools); "bank-fed" is exactly the trust objection. The signed, tamper-evident payload is security machinery with no current defect (scope rule 2/3); drop it. Lowest information per hour.

**I8 Post-raise spend-creep guardrail** (D/M, retention)
- FOR: a clear trigger moment (the equity wire), and trailing-3 runway (`DEFAULT_LOOKBACK_MONTHS = 3`) really does overstate runway when burn ramps.
- Objection: the overstatement for a linear ramp is arithmetic, not a simulation result. Founders who just raised have 24+ months of runway and feel no pain, which is why they over-hire.
- Failure mode: projecting a ramp from 1–2 post-raise months is noise, and warnings get ignored while the company is flush.
- prior_work: plausibly differentiable but **subsumed by I2**. Fold it in as one I2 profile, not a separate feature.

**I9 AI-native gross-margin runway** (D/L, activation)
- FOR: the hottest segment; Ramp reports token spend up 13x; `ai-spend.ts` exists; a cross-rail view beats Ramp-only.
- Objection: the MVE's result is set by its parameters (25%/mo for 12 months is 14.5x). Margin needs revenue mapping, and Stripe is not connected (README "not built"). Much token spend sits on other cards (the I16 problem).
- Failure mode: a tautological pass, while real users' token spend is off-feed.
- prior_work: a real "already done" for Ramp-card customers (AI Token Spend Management, competitors.md:16). A separate growth stream for `ai_api` in the projection is a small forecast tweak, not a wedge.

**I10 Offboarding sweep** (D/L, retention)
- FOR: a concrete moment with visible dollars that reuses the zombie detector and verification; sub-50 teams lack IdP offboarding.
- Objection: departures happen about 1–3 times a year at a 10-person company, for small sums (Priya: $423/mo). If every tool sits on the founder's card, the per-person signal does not exist.
- Failure mode: rarely triggered. The "saves ≥2 months of leakage" pass is just `ZOMBIE_IDLE_DAYS = 60` restated.
- prior_work: differentiable below the SSO market, but low frequency. A cheap feature later; no pilot.

**I11 Runway levers beyond SaaS waste** (D/L, activation)
- FOR: it tests the product's own hero line ("turns it into months of runway") before anyone pays for it.
- Objection: the answer is set by the sampled spend mix, so a 500-company simulation restates the prior. The arithmetic: waste of 25–35% × software at 2–8% of burn is 0.5–2.8% of burn, about 0.1–0.5 months on an 18-month runway. The treasury-yield lever approaches advice territory (trust_compliance:42, "get counsel first"), and Rho already sells treasury.
- Failure mode: repositioning around a lever list that the existing planner and goal-seek already compute.
- prior_work: own planner. **Do it as a 30-minute desk calculation**: it is high-information for positioning and needs no simulation.

**I12 Committed vs discretionary floor burn** (D/M, activation)
- FOR: answers the real question when a raise slips ("how far can we stretch, and how fast?") and leads naturally into Copilot cut plans.
- Objection: notice periods, lease terms and severance are not in a bank feed. Scoring ">90% classification accuracy" against labels the same author wrote measures self-agreement.
- Failure mode: an authoritative-looking floor that is wrong about contract terms.
- prior_work: differentiable (no tool found, but check Blaze), and largely a spreadsheet exercise. Medium priority, no pilot now.

**I13 Savings decay + digest materiality** (D/M, monetization)
- FOR: it targets the real monetization risk: is a subscription justified after the first cleanup?
- Objection: two hypotheses bundled together, both answered by an invented arrival process. Sending the digest less often also weakens the weekly ritual that the retention case relies on (retention_features:67).
- Failure mode: whichever conclusion the assumed Poisson rates imply.
- prior_work: not competitive. Hygiene part: count how many current Monday digests on the base generator carry nothing actionable (an hour). The pricing conclusion is a desk decision.

**I14 Sticky categorization rules** (D/L, retention)
- FOR: switching cost plus a trust fix; the README lists it as not yet built.
- Objection: parity, not a wedge (Copilot Money and Mercury already ship it). Rules-only categorization is already 97.1% with one miss (a coffee shop), so the shard's own kill criterion (uncorrected error < 0.1 months) very likely fires on the base data.
- Failure mode: built and rarely used.
- prior_work: a real "already done". Build when real users report miscategorization; no pilot.

**I15 CSV Runway Grader** (D/L, acquisition)
- FOR: lifts the Rho-only ceiling (icp:43; Mercury ~300K customers) with no OAuth, no partner approval and no stored data. The deterministic pipeline already runs in the browser.
- Objection: one-shot graders get one visit. Mercury users already have free runway in Insights. Generic CSVs lack cardholder and transaction-type fields, so zombie detection and transfer-vs-burn handling degrade.
- Failure mode: **the CTA has nowhere to send a Mercury user.** The only connect path is single-tenant Rho, so top-of-funnel interest cannot convert. That is a named risk for the build plan, not for the pilot.
- prior_work: differentiable (Ramp's calculator and HubSpot Grader are templates, not your own transactions). The parity question (CSV vs API path: recall loss, runway delta, transfer handling) is genuinely uncertain and cheap to measure.

**I16 Cross-rail blind-spot meter** (W/M, acquisition)
- FOR: competitors.md:128 names the bank-agnostic, cross-account layer as the defensible wedge, and no bank will build it.
- Objection: the recall drop is set by how many subscriptions the simulation moves off-feed. The statement-CSV merge is mostly I15's parser plus de-duplication, and founders won't upload card statements monthly.
- Failure mode: double-counted burn after a merge, plus upload fatigue.
- prior_work: differentiable (none found; check Blaze). The useful piece now is a burn-correctness desk check: card-payoff lumps must count as burn exactly once. Sequence it after I15.

**I17 Covenant / bank-minimum breach date** (D/M, monetization)
- FOR: a binding constraint for venture-debt borrowers that is trivial to compute from existing Monte Carlo paths, with a lender and CFO angle.
- Objection: a small segment. Real covenants are more complex than one cash floor, and the band ignores trends (README), so breach probabilities inherit that flaw.
- Failure mode: a niche feature with wrong covenant definitions.
- prior_work: differentiable but niche (manual Kruze-style guides). A user-set cash floor on the existing low-runway alert is a cheap generalisation; no pilot.

**I18 Privacy-safe peer spend benchmark** (W/H, acquisition)
- FOR: a transparent "Startup Spend Index" would be a content asset, and no Mercury or Ramp category-mix report was found.
- Objection: it needs hundreds of opted-in real companies per cell, and the product has zero. The simulation answers a textbook differential-privacy noise question. Ramp or Mercury could publish this from millions of transactions overnight.
- Failure mode: the opt-in population never reaches N.
- prior_work: a real "already done-able" by data holders, and adjacent to the brief's non-goal (benchmark databases). Park it; zero information from simulation.

### Ranking (expected information × upside per pilot-hour)

| Rank | Idea | Treatment | Why |
|---|---|---|---|
| 1 | I6 Verification hardening | **Hygiene — fix now** | Confirmed defect; blocks I3, I13 and the G1 claim. |
| 2 | I5 Detector stress harness | **Pilot** | Highest real uncertainty; measures shipped code on unseen shapes. |
| 3 | I15 CSV grader parity | **Pilot** | High upside (lifts the Rho-only cap); parity is genuinely unknown. |
| 4 | I1 Advisor console | **Pilot (high-risk slot)** + desk check on Rho's accountant tooling | Biggest acquisition upside; the simulation tests only a necessary condition. |
| 5 | I11 Levers beyond waste | Desk calculation (30 min) | Decides whether the hero claim survives; no simulation needed. |
| 6 | I2 (+ I8) Backtested runway | Desk check: backtest the existing method only | Informative only on the base method; drift variant only if coverage fails. |
| 7 | I4 Inbox | Hygiene: sort by $ | The ranking model is unjustified at ~6 items. |
| 8 | I16 Cross-rail | Desk check on burn correctness; after I15 | Defensible wedge, but the simulated blind-spot size is set by construction. |
| 9 | I3 Verified-savings pricing | Desk decision after I6 | Willingness to pay cannot be tested here. |
| 10 | I12 Floor burn | Later | Scored against own labels. |
| 11 | I13 Decay + digest | One-hour digest-emptiness count | Arrival process is invented. |
| 12 | I14 Sticky rules | Later (parity) | Kill criterion likely fires on the base data. |
| 13 | I9 Token margin | Small forecast tweak | Ramp already ships it; tautological MVE. |
| 14 | I17 Covenant | Later (cash-floor setting) | Niche. |
| 15 | I10 Offboarding | Later | Low frequency; lead time = 60-day constant. |
| 16 | I8 Post-raise | Merge into I2 | Subsumed. |
| 17 | I7 Investor card | Park | High risk, low information; signing machinery out of scope. |
| 18 | I18 DP benchmark | Park | No users, no information. |

### What I would actually pilot

1. **I5 detector stress harness.** It measures the shipped detectors on billing-day drift, renames, annual conversion, a shared founder card and 5–40 cardholders. Each detector either holds or it doesn't, and the result changes what the README, pitch and pricing may claim. Keep it to measurement. Write perturbations from external descriptions of real billing and export behaviour, not from detector internals.
2. **I15 CSV grader parity.** Export the generator to Rho-like, Mercury-like and generic CSV, run the existing pipeline, and report per-detector recall loss and runway delta. The decisive check is transfer vs burn without a type field. The answer is genuinely unknown, and it gates the cheapest route past the Rho-only cap.
3. **I1 advisor console, in the high-risk slot,** because the first two picks are both LOW risk and I1 has the most upside. What would convince me in simulation:
   - Use 30-company portfolios in which the trouble comes from a revenue drop (20–50% of Stripe inflow at a random month), not from a burn spike, so the shock does not arrive through the score's own inputs.
   - Include distractors in every company: a seasonal dip, a $40K legal one-off, an annual prepayment.
   - Pass: the composite score puts ≥80% of companies that actually fall under 6 months of runway within 3 months into the top 5, beats a plain trailing-runway sort by ≥15 points, and puts ≤1 distractor-only company in the top 5, across 50 portfolios.

   Even a pass proves only that the signals separate trouble from noise. Before weeks of build, two non-simulation gates stand: what Rho's own accountant multi-client tooling does, and whether partner OAuth lets one advisor hold many client grants. Advisor demand stays untested.

### Build regardless (hygiene, no pilot)

- **I6 fix:**
  - One prior charge means unknown cadence. Mark it waiting or unverifiable until at least ~13 months after that charge, not "verified" after one month.
  - An empty outcome list means waiting, not verified.
  - Add both as regression tests.
- **I4 minimal:** sort the Inbox by dollar impact.
- **I11:** a desk calculation of waste-as-runway-months for a typical seed spend mix. If it comes out around 0.1–0.5 months, change the hero line before anything else.
- **I2 minimal:** a backtest of the existing runway and band on the base generator, reported honestly whatever the outcome.

### Complexity added since the brainstorm (red flags)

- I4 merges calibrated confidence (which needs I5 data) with a cost-of-delay model, on a 6-item backlog.
- I5 adds calibration and OOD "ask the owner" suppression on top of a measurement that has not run yet.
- I6's shard adds a descriptor-similarity successor search. The two confirmed defects need no such machinery.
- I7 adds a signed, tamper-evident payload, a digest-binding scheme with no current defect.
- I13 bundles two unrelated hypotheses into one idea.
- The shared "variation wrapper" is necessary, but it is where circularity enters. Keep it to a few explicit, externally motivated perturbations; it is not a framework.

The candidate table itself is a faithful merge of the shards, and I found no idea dropped or inflated on taste. The effort column understates I1. The other estimates look right.
