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

## Candidate pool (Stage 2)
_pending_

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
