# Novelty check: I1 Advisor / fractional-CFO console

## Prompt

You are a fresh, skeptical novelty reviewer (product/competitive analyst). Read the idea yourself: /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md row I1 and the shards in /home/user/AITX-MLOps-Hack/sleep-research/traces/ideas/ with dedup_keys "fractional-cfo-client-book", "advisor-console-proadvisor", "fractional-cfo-triage-board". Also read /home/user/AITX-MLOps-Hack/sleep-research/traces/triage/round1.md for the triage reviewer's concerns (notably: Rho reportedly runs an accountant program "with multi-client tooling").

Core claims to check:
1. Fractional CFOs/accountants serving 10-40 startups lack a cheap, bank-feed-native (not GL-based) multi-client monitor that ranks clients by runway/burn risk and exceptions.
2. A free advisor seat + per-client pricing is an effective channel for this category.
3. Rho's own accountant/partner tooling does not already provide multi-client runway/risk triage; Rho partner OAuth allows one advisor app to hold grants for many client organizations.

Search with at least 3 query formulations per claim, including the last 3-6 months (today is 2026-10-31): Rho accountant program / Rho for accounting firms / Rho partner API OAuth; Mercury for accountants / Mercury multi-entity; Brex/Ramp accountant portals; Fathom, Jirav, Reach Reporting, Digits/Puzzle/Pilot for accountants, Kruze, Finta, Runway/cfo.ai multi-client; "client portfolio dashboard fractional CFO"; Plaid multi-item apps for advisors. Note which fetches fail.

For each claim: NOVEL / PARTIALLY ANTICIPATED / ALREADY DONE, with closest prior work (name, year, link) and the exact difference. Overall novelty HIGH / MEDIUM / LOW / NONE, and suggested positioning. Do not call something novel because you didn't find it; say how hard you looked.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write your prompt (under "## Prompt") and your full answer (under "## Response") verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/novelty/I1-advisor-console.md and return the answer as your final message. Do not edit any other files.

## Response

**Overall novelty: LOW.** A multi-client console is commoditized, and incumbents give it away free. That includes bank-native consoles from Rho and Mercury themselves. Multi-client risk triage also exists: Fathom and Intuit run it on GL data, and re:cap runs it on bank data for investors. The only part I could not find anywhere is narrow. It is a forward-looking risk ranking (P10 runway, burn acceleration, open waste) computed from bank feeds across a US fractional CFO's startup clients. That ranking quality is exactly what the planned precision@5 pilot tests, and it is the only thing worth pitching.

### How hard I looked, and what failed

- I ran about 40 web searches, with at least 3 formulations per claim. Six of them targeted May–Oct 2026 (Intuit Accountant Suite May/Oct 2026, Ramp Stack Jun 2026, Rho 2026 launches, cfo.ai, recent fractional-CFO tool roundups).
- **All page fetches failed:** `rho.co`, `www.rho.co` and `docs.rho.co` returned DNS ENOTFOUND (outside the session's allowed network domains). Per the session rule, I stopped fetching after those, so every finding below comes from search-engine result summaries, not full-page reads. Exact feature scope, prices and launch dates are therefore "as reported by the cited page" and should be checked on the vendor page before going into a pitch.
- **Searched without a specific hit:** Kruze, Pilot, Finta (no multi-client monitoring product surfaced), cfo.ai/Ari (founder-facing, no evidence of a multi-client mode), Jirav and Reach Reporting (per-client report packages; no portfolio-wide alerting found).
- **Not searched:** Blaze for accountants.

### Claim 1: no cheap, bank-feed-native multi-client monitor that ranks clients by runway/burn risk

**Verdict: PARTIALLY ANTICIPATED.** Each half exists separately, often free. I found no product that combines them for this segment.

*Multi-client risk triage on GL data (exists, cheap or free):*
- **Fathom Insights Dashboard and Portfolio Plan** (launch year not confirmed from snippets). All imported clients sit on one dashboard with red/amber/green thresholds on cash on hand and net cash flow. Fathom's own guidance is to filter to "red" and "sort this list by worst performance to prioritise which clients need outreach". The Portfolio plan is about A$495/mo flat for a whole client book, and data updates through the most recently completed month. https://www.fathomhq.com/blog/need-to-confidently-manage-all-your-clients-3-ways-to-use-the-insights-dashboard ; https://fathomhq.com/portfolio
- **Xero HQ client insights** (Sept 2024, free to Xero partners). For every client it shows cash balance, AR/AP, current ratio and bank-reconciliation status (date, value and count of unreconciled items). It refreshes hourly and is sortable and filterable. https://blog.xero.com/product-updates/introducing-xero-client-insights/
- **Intuit Accountant Suite** (May 2026 and Oct 2026 updates; Core is free, and QBO Accountant sunsets 2026-12-31). It has Client Insights with segments and benchmarks, a "cross-client portfolio insights" widget, and Cashflow Forecasting that "unites your clients' QuickBooks history, live bank activity, and predictive intelligence". The Accelerate tier adds AI anomaly and KPI monitoring and is reported at $149/mo. https://www.accountingtoday.com/partnerinsights/intuit/article/intuit-accountant-suite-may-2026-feature-launch-the-ai-powered-future-of-firm-management ; https://quickbooks.intuit.com/ca/resources/accountants/quickbooks-accountant-suite-october-2026-updates/
- **Syft** (Cash Manager with runway and cash buffer; Syft Send alerts on abnormally low bank balances; practice-level oversight). **Alpyne** (all-client snapshot of cash balance, revenue and close dates; G2 lists $69–79 per client). **Lole Labs** (new, multi-client, AI KPI alerts, QBO/Xero/Stripe).

*Bank-native multi-client views (exist, free, but show balances and spend rather than runway risk):*
- **Rho Partner Portal** (Nov 2024): a "consolidated view of their entire book of business", plus cash and spend management for clients. https://www.cpapracticeadvisor.com/2024/11/14/rho-launches-partner-portal-for-accountants/152194/
- **Mercury Advisor Portal and All Accounts dashboard** (free program): "balances and money movement across every account" you are a member of. https://support.mercury.com/hc/en-us/articles/35624262501524-View-All-Accounts
- **Ramp Advisor Console**: a Cross Business Spend report by vendor and category, plus per-client efficiency. https://support.ramp.com/advisor-console-reporting
- **Brex Pro Access**: unlimited client accounts under one login.

*Bank-native portfolio runway monitoring with alerts (exists, for investors and lenders, EU/UK):*
- **re:cap Institutional** (year not confirmed): starts "with a focus on bank account data", and includes runway analysis, monitoring rules and "customized trigger alerts to help spot struggling portfolio companies". https://www.re-cap.com/blog/re-cap-institutional

**What is actually left:** I found no product that ranks a fractional CFO's US startup clients by forward-looking runway risk (probabilistic runway, burn acceleration, change-detector severity), computed from bank transactions, with SaaS-waste exceptions attached.

Two parts of the claim do not survive:
- **"Cheap" is not a differentiator.** Xero HQ, Intuit Core, and the Mercury and Rho portals are free.
- **"GL lags the books" is weaker than stated.** Xero and QBO ingest daily bank feeds, and Intuit's new forecast uses live bank activity. The lag is in categorization and month-close, not in the cash balance. Fathom's Portfolio tier is the exception, since it only updates through the last completed month.

### Claim 2: a free advisor seat plus per-client pricing is an effective channel

**Verdict: ALREADY DONE as a model. Its effectiveness for this product is unverified.**

- The model is the industry default:
  - QuickBooks ProAdvisor and the Accountant Suite (free seat, ProAdvisor Preferred Pricing for clients).
  - The Xero partner program (HQ free).
  - Gusto and BILL partner programs (free, with revenue share or tiers; BILL cites 9,000+ firms).
  - Per-client wholesale pricing: Jirav (about $50–150 per client per month wholesale vs $10K+/yr direct), Float (historically £7 per client per month), Alpyne (per client).
- Nothing here is new. The shards' ProAdvisor analogy is accurate.
- **No source gives a channel share figure** (the percentage of customers arriving via accountants) for Gusto, BILL or Intuit. So "one sale brings 10–30 orgs" stays a hypothesis.
- **Incentives cut against a paid add-on.** Banks pay the same advisors to use their free portals:
  - Mercury: up to $1,000 per referred client plus a free Mercury Pro seat (reported $4,200/yr).
  - Rho: a $2.5K bonus after the second client via the BDO Alliance.
  - Brex: Premium partner status and waived card fees.
- A per-client fee for a bank-data monitor has to beat "free, and the bank pays me".
- **One supporting data point:** Futureproof says fractional-CFO tool stacks ($275–980/mo) are paid by the client. That makes per-client pass-through plausible. https://www.runfutureproof.com/blog/fractional-cfo-tech-stack

### Claim 3: Rho's tooling lacks multi-client runway triage, and Rho partner OAuth lets one app hold many client grants

**Verdict: PARTIALLY ANTICIPATED. The multi-client half is done by Rho. The runway-triage half was not found. OAuth multi-grant is plausible but not confirmed.**

**The triage reviewer's concern is correct.** Rho has shipped an accountant Partner Portal since Nov 2024: a consolidated book-of-business view, staff provisioning, and client-approved permission groups. Within it, the "Partner Accountant" role gets read-only access to transactions and bills and can "generate bank feed tokens".
- https://www.accountingtoday.com/news/rho-offers-partner-portal-for-accountants-for-client-management-onboarding
- https://rho.co/help-center/partner-portal/partner-roles-permissions-overview

**I found no evidence of runway, burn-risk ranking or exception triage** in the portal, and no 2026 Rho launch adding one. The closest Rho news is AI Stack credits and a Puzzle integration (via an aggregator). Rho's own SEO answer pages contradict each other: one says Rho shows cash and burn but "does not calculate runway automatically", another claims a "cash forecasting module". Neither is authoritative, and rho.co could not be fetched. So "Rho lacks it" is **not found**, not **confirmed absent**. Rho is also actively building this channel: it is hiring a Law Firm and Accounting Partnerships Lead (around Sept 2026).

**What the OAuth docs say** (search summary of docs.rho.co/docs/v1/partner-auth):
- Authorization-code flow with PKCE (S256) at auth.rho.co.
- Rho must approve and register the client first (email api-partner-request@rho.co).
- During consent the customer "selects the business they want to connect".
- Only Account Owners and Admins can authorize.
- Access tokens expire in 900 s, with refresh tokens via `offline_access`.

**What this means for I1:**
- One partner app holding one grant per client business is the normal shape of this flow, so the claim is plausible. The docs, as seen in the summaries, do not state it outright.
- **Each client's owner or admin must consent individually.** The advisor's read-only Partner Accountant role does not appear able to authorize for the client.
- **Partner approval by Rho is a gate.** This matches the triage note that the current app has no partner OAuth.
- Mercury's partner OAuth is likewise approval-gated (https://docs.mercury.com/docs/integrations-with-oauth2).

### Corrections to the project's own text

- **IDEA_REPORT.md row I1, prior_work** ("QuickBooks ProAdvisor console (GL-based); Fathom and Jirav (GL, per company); none bank-native found") is wrong on two counts:
  - Fathom has a portfolio-level risk dashboard. It is not only per company.
  - Bank-native multi-client consoles exist: Rho Partner Portal, Mercury Advisor Portal, Ramp Advisor Console, and re:cap Institutional for investors.
- **Gap G3** should drop "cheap" and "no multi-client tool". What remains is: "no forward-looking, bank-data runway-risk ranking for advisors' startup clients was found."

### Suggested positioning

- **Don't sell a "console".** Sell the ranking: "which 5 of your clients will fall under 6 months of runway this quarter, and why". Show it as a weekly exception list next to the free bank and GL portals the advisor already uses.
- **Present the forecast as the moat, not the data source.** Fathom and Intuit already have the multi-client screen, but theirs is threshold-based or GL-based.
- **Given the Rho dependency, partner with Rho rather than compete.** Pitch it as an app in Rho's accountant program, which would fill the runway gap left by a Partner Portal that apparently ranks nothing.
- **Make "advisor demand" and "Rho partner approval" explicit gates** ahead of the "weeks" build, as triage already said.
- **re:cap Institutional shows investors pay for bank-native early warning.** A VC or accelerator variant may face less free competition than the accountant one.
