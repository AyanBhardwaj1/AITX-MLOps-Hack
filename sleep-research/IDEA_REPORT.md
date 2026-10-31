# Idea Report — Which product wedges make Runway a business?

Run: runway-market-wedge-20261031 · Reviewer route: **same-family (provisional)** — no Codex/Gemini or other non-Claude reviewer is available in this sandbox, so every verdict comes from a fresh Claude subagent given file paths only. Treat verdicts as provisional.

## Brief (Stage 0)

**Direction (user, verbatim):** "do this for market research then /anthropic-skills:ai-engineer all that u research into product".

**Adapted question.** Runway for Rho is a post-hackathon startup-finance product. It reads a bank feed read-only and computes burn, runway and a Monte Carlo range deterministically. It also detects SaaS waste and verifies savings, runs a default-alive planner, and sends a Monday digest and alerts. Copilot and Autopilot agents draft actions into a human-approval Inbox. Which next product wedges most increase the chance that founders, or the people who serve them, **adopt, keep using and pay for it**, given the market as of Oct 2026? Ship the winners into the product.

**How this run adapts the ML-research method to market research.**
- "Papers" are market sources: vendor docs, pricing pages, launches, surveys and reports.
- "Novelty" means "is a competitor already shipping this for this buyer?"
- "Pilots and experiments" are cheap, falsifiable checks the sandbox can run:
  - quantitative simulations on synthetic company cohorts (the seeded demo generator across many seeds and profiles);
  - working prototypes measured on those cohorts;
  - desk checks of API feasibility.
- There are **no real users or real ledgers** here. Every quantitative result is `simulation_only` or `synthetic_proxy` (see integrity rules). No claim may say "users will…"; claims are bounded to "in simulation" or "as designed".

**Constraints.**
- Hackathon dependency rule: pin deps to versions ≥ 2 weeks old.
- No secrets in the repo; the repo is public.
- Rho, OpenAI, Mercury and Plaid are unreachable from the sandbox, so live integrations can be built and unit-tested but not run live.
- Read-only and drafts-only stay non-negotiable.
- Budget: this session's wall clock; compute is local Node (no GPU needed).

**Non-goals.** Money movement, bookkeeping/GL, SSO seat tracking, and price-benchmark databases (the earlier report says incumbents own these).

## Literature landscape (Stage 1)

Built on the earlier research in `research_notes/Runway product go to market/` (four notes with cited URLs) and `reports/Runway product go to market.md`. Source verification:
- **Partly verified.** In the earlier run, most vendor facts came from search-result excerpts because direct fetches of mercury.com, ramp.com, rho.co, openai.com and others were blocked by the sandbox network (each note records this).
- **Verified facts** (fetched or corroborated by two or more independent excerpts in the notes): Capital One–Brex close (SEC filing), Productiv shutdown, Vertice–Vendr, Mercury Insights launch, cfo.ai rebrand.
- **Unverified.** Anything sourced from a single aggregator excerpt (several prices) is treated as `[UNVERIFIED]` in this run.

### Sub-directions and what each implies
1. **Banks and spend platforms bundle insights for free.**
   - Mercury Insights (Mar 2026): AI cash-flow alerts and chat.
   - Ramp: duplicate-subscription detection, procurement agents (Apr 2026) and AI token spend (Jul 2026); 85K+ customers.
   - Brex: agents; now inside Capital One.
   - Implication: single-bank dashboards are commoditized. Value must come from a cross-account view, action, or verification.
2. **SaaS management moved up-market and consolidated.**
   - Vertice absorbed Vendr; Productiv shut down (Aug 2026).
   - Zylo, Tropic and Spendflo cost $10K–$200K+/yr and rely on SSO and usage data.
   - Implication: sub-50-person teams without SSO are unserved; bank and card data is their only signal.
3. **AI CFO / FP&A for founders.** cfo.ai (ex-Runway.com) "Ari" at about $375–$1,125/mo works from QuickBooks/NetSuite/Stripe, not the bank. Blaze (YC) projects runway via Plaid. Causal went to Lucanet, Mosaic to HiBob, Pry to Brex.
4. **AI bookkeeping.** Digits, Puzzle, Pilot and Kick for founders; Basis and Rillet for firms. Heavily funded; owns the GL.
5. **Trust and agents.** Finance leaders rarely fully trust AI (14% full trust, Esker Sept 2026); 90% require human approval (Medius). Approval fatigue is a known failure mode.
6. **Distribution.**
   - Rho: read-only API open to all customers since Jul 2026; OAuth partner process; perks program; hiring an accounting-partnerships lead.
   - Mercury: about 300K customers; read-only tokens.
   - Fractional CFOs and accountants as a channel.

### Recurring limitations and structural gaps (inputs to Stage 2)
- **G1.** No product verifies that savings actually landed. Detection tools report "found"; verification needs a bank feed over time. *Shipped in Runway already.*
- **G2.** Cross-bank and card consolidation for small teams: no bank will show a rival's accounts.
- **G3.** The fractional CFO serving 10–30 startups has no cheap multi-client, bank-native monitoring tool; Fathom and Jirav are GL-based.
- **G4.** Activation friction: the connect-a-bank step and "time to first insight". Startups churn back to spreadsheets when setup costs exceed perceived value.
- **G5.** Approval fatigue in agent inboxes: undifferentiated drafts get rubber-stamped.
- **G6.** Categorization drift on real ledgers. Runway's detectors were tuned on its own generator (self-acknowledged caveat), so robustness on unfamiliar company shapes is unproven.
- **G7.** The fundraising moment (seed → A gap about 2.2 years) creates acute demand for a credible runway narrative to show investors.

## Candidate pool (Stage 2) and feasibility notes (Stage 3)

Five lens subagents (pattern-transfer, contradiction, untested-assumption, segment-moment, diagnostic) produced 25 candidates. The raw shards, with full hypotheses, MVEs and evidence links, are in `traces/ideas/*.json`. A mechanical merge collapsed candidates that share a core hypothesis, leaving **18**. No idea was dropped on taste.

**Feasibility gate.** Nothing is eliminated. Every MVE runs in local Node on synthetic cohorts in minutes. Ideas whose claims need real users or real population data are annotated, not dropped: their sandbox evidence is capped at `simulation_only`.

**Shared prerequisite** (raised by all five shards): `generateDemoCompany` has one company shape. Any cohort MVE first needs a variation wrapper (scale cash, payroll and revenue, change the growth profile, move subscriptions between cards, plant departures, raises and annual contracts).

**Columns:**
- *Effort:* D = days, W = weeks.
- *Risk:* L = low, M = medium, H = high.
- *so_what:* why the result matters either way.
- *prior_work:* closest competitor or prior art, from the shards' evidence.

| # | Idea (merged keys) | Type | Effort / risk | so_what | prior_work |
|---|---|---|---|---|---|
| I1 | **Advisor / fractional-CFO console**: multi-client triage ranked by risk; per-client pricing; advisor seat free (fractional-cfo-client-book, advisor-console-proadvisor, fractional-cfo-triage-board) | acquisition | W / M | One sale brings 10–30 orgs. A failed ranking (precision@5 < 0.8) means advisors won't return | QuickBooks ProAdvisor console (GL-based); Fathom and Jirav (GL, per company); none bank-native found |
| I2 | **Backtested, trend-aware runway**: replay past forecasts against realized cash, show the error/coverage track record, and add a trend-aware band (backtested-runway-estimator, backtested-runway-vs-spreadsheet, runway-backtest-calibration) | trust / retention | D / L | If the current band already covers 70–90% → no feature needed (useful negative). Else the product publishes its own accuracy, which no bank does | Mercury Insights shows runway without an error bar; cfo.ai models from the GL; no published track record found |
| I3 | **Price on verified savings**: free until verified savings ≥ 3× price, or a success fee (verified-savings-price-gate, success-fee-verified-savings) | monetization | D / M | Tells whether a savings-anchored price is viable on realistic waste levels, or if savings front-load (retention cliff) | Rocket Money success fee (consumer); Vertice savings guarantee (enterprise) |
| I4 | **Inbox ranked for approval fatigue**: expected value × calibrated confidence, plus renewal-cliff cost of delay; batch low-value items (calibrated-ev-inbox, cost-of-delay-inbox) | trust / retention | D / L–M | With k approvals/week, does ordering capture materially more realized savings? | Ramp agents auto-approve by policy; Medius 90% human approval; no EV-ordered startup inbox found |
| I5 | **Detector stress harness + calibrated confidence** (detector-shape-stress-calibration) | trust | D / L | Establishes whether the 100% eval holds beyond one company shape (G6). A negative result is itself valuable | Own eval only (`docs/eval-results.md`) |
| I6 | **Harden savings verification** for annual and too-short histories, off-feed moves, renames (verification-false-positive-hardening). *Also reported as a probable defect in `src/lib/insights/savings.ts`* | trust | D / L | A false "verified" undermines the core claim and any savings-based price | none |
| I7 | **Investor live runway card + consented portfolio watch**: aggregate-only signed card; free investor page (vc-portfolio-runway-watch, investor-live-card-loop) | acquisition | W / H | Distribution through investors; privacy and lead-time results bound it | Visible.vc updates; portfolio-monitoring tools (self-reported data) |
| I8 | **Post-raise spend-creep guardrail**: ramp-aware runway after an equity wire (post-raise-spend-creep) | retention | D / M | Trailing-3-month runway may overstate runway exactly when founders over-hire | none bank-native found |
| I9 | **AI-native gross-margin runway**: tokens as COGS, a two-stream forecast (ai-native-token-margin-runway) | activation | D / L | If separating AI spend flips verdicts for ≥ 20% of AI-heavy profiles, it is a wedge vs single-rail tools | Ramp AI token spend (Ramp cards only) |
| I10 | **Offboarding sweep** when someone leaves (employee-departure-offboarding-sweep) | retention | D / L | Catches idle-card waste months earlier than the 60-day zombie rule; reuses verification | SSO/IdP offboarding (up-market) |
| I11 | **Runway levers beyond SaaS waste**: rank hire timing, AI spend, renewals, waste (runway-levers-beyond-saas-waste) | activation | D / L | If waste is rarely the top lever, the product pitch must change | goal-seek already exists |
| I12 | **Committed vs discretionary floor burn / survival runway** (committed-vs-discretionary-floor-burn) | activation | D / M | Answers "how far could we stretch if the raise slips?" | Rho blog framing; no tool found |
| I13 | **Savings decay and digest materiality**: price a one-time audit plus monitoring; send the digest only when material (savings-decay-and-digest-materiality) | monetization | D / M | Tests whether recurring savings support a subscription and whether weekly digests are mostly empty | Notification-fatigue literature |
| I14 | **Sticky categorization rules**: retroactive per-tenant rules (sticky-category-rules) | retention | D / L | If uncorrected runway error is already < 0.1 mo, drop it | Copilot Money rules; Mercury exclude one-offs |
| I15 | **CSV Runway Grader**: no-signup, in-browser, any bank (csv-runway-grader) | acquisition | D / L | Removes the Rho-only cap and OAuth friction; tests parity with the API path | Ramp savings calculator; HubSpot Grader |
| I16 | **Cross-rail blind-spot meter**: off-feed card lumps + statement CSV merge (cross-rail-blind-spot) | acquisition | W / M | Quantifies what a single bank view misses (G2) | none found |
| I17 | **Covenant / bank-minimum breach date** from Monte Carlo paths (covenant-breach-date) | monetization | D / M | Venture-debt companies care about the floor, not zero cash | Kruze and lender guides (manual) |
| I18 | **Privacy-safe peer spend benchmark** with DP and k-anonymity (dp-peer-spend-benchmark) | acquisition | W / H | Requires N opted-in companies per cell; synthetic only here | Ramp/Vendr own SKU price benchmarks; category benchmarks unsourced |

## Triage (reviewer)
_pending_

## Novelty
_pending_

## Pilots
_pending_

## Chosen idea
_pending_

## Backups and eliminated
_pending_
