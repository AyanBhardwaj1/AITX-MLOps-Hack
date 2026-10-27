# Product Landscape & Feature Inspiration for "Runway" (AI startup-finance / runway / spend-waste agent), as of Oct 2026

Research method note: WebSearch worked; WebFetch and curl were blocked for nearly every target domain (rho.co, docs.rho.co, support.ramp.com, devpost.com, skills.sh all returned DNS failure or proxy 403). So most findings below come from search-result summaries of the cited pages, not full-page reads. Treat details (especially numbers) as "per search snippet of the cited page". Most sources are vendor marketing; flagged where relevant.

## Q1. What do Ramp, Brex, Mercury, Rho, Puzzle, Digits, Runway Financial, Mosaic, Zylo/Cledara/Vendr/Spendflo etc. offer for burn/runway, spend insights, SaaS waste, price benchmarking, forecasting and AI agents (2025–2026)?

### Takeaway
The incumbents have converged on (a) agents that act on spend (Ramp procurement/purchasing agents, Brex Expense/Review/Audit agents, Digits accounting agents, Runway's "Ari"), (b) peer price benchmarks built from their own transaction networks (Ramp Price Intelligence, Vendr), and (c) read-only MCP access to bank data (Rho, Mercury, Ramp MCP/CLI). Nobody in the bank-native tier (Rho, Mercury) ships an opinionated "runway + waste + action" agent out of the box. Mercury's early MCP users are building burn-rate views themselves, and Rho's own AI features are AP-focused. That is the gap Runway can fill.

### Cited Findings

**Rho (the hackathon sponsor; the data source)**
- The Rho API is read-only. Tokens are created in Rho banking settings by Account Owners or Admins, with a 2FA challenge at creation. Scopes are `accounts:read`, `transactions:read` and `statements:read`, and a request whose token lacks a scope gets a 403. — [docs.rho.co auth](https://docs.rho.co/docs/v1/auth.md)
- Tokens expire within a maximum of one year, and the secret is shown only once. — [docs.rho.co auth](https://docs.rho.co/docs/v1/auth.md)
- Base URL is `https://rhoapi.rho.co/api/v1/`. The sandbox at `rhoapi-sandbox.rho.co` accepts any non-empty bearer token. — [docs.rho.co getting started](https://docs.rho.co/docs/v1/getting-started.md)
- `/transactions` can be filtered by settled status and posting-date window, and paginates with a cursor (`next_page_token`). The docs recommend `transaction.id` as the primary key, because re-fetching the same window returns the same IDs (good for idempotent upserts). — [docs.rho.co transactions](https://docs.rho.co/docs/v1/transactions)
- Tokens can't start payments or change the account, and write access and webhooks are "not yet" offered. So sync must poll. — [rho.co/product/api](https://rho.co/product/api)
- Rho has a remote MCP connector at `rhoapi.rho.co/mcp/v1` with tools for accounts, transactions and related data. It can be added to Claude, ChatGPT and Grok with no local install. — [Skills Playground Rho MCP connector](https://skillsplayground.com/connectors/co-rho-api/)
- Rho's own blog ranks banking API/MCP platforms with Rho as the top pick, and describes first-party, read-only MCP access to accounts, transactions and statements, with no agent money movement. This is vendor content (the page could not be fetched). — [Rho blog: best banking APIs](https://www.rho.co/blog/best-banking-apis-for-business)
- Do not confuse this with "Rho X MCP" (`@rholabs/rho-mcp`), an unrelated interest-rate-derivatives trading product. — [docs.rho.trading](https://docs.rho.trading/developer/rho-mcp-server)
- Rho's existing AI features are AI invoice scanning, automated approval routing and accounting sync. Its AI-powered AP automation dates to Aug 2023. In Jan 2026 Rho and Stripe announced a partnership. Rho Treasury invests idle cash in T-bills and MMFs. The minimum conflicts between sources ($100K vs $50K), and the top-tier yield is quoted at up to 4.55% as of 08/03/2026. Checking has $0 same-day ACH and $0 domestic wires (as of 08/02/2026). — [Rho llms-full.txt](https://www.rho.co/llms-full.txt), [Rho blog: banks for AI startups](https://www.rho.co/blog/best-banks-for-ai-startups)
- I found no 2026 "Rho AI agent" product launch. — same search results as above

**Mercury**
- Mercury's hosted MCP server (`https://mcp.mercury.com/mcp`, Streamable HTTP + OAuth) gives read-only access to accounts, transactions, balances, statements, cards, recipients and treasury. The setup command is `claude mcp add mercury --transport http https://mcp.mercury.com/mcp`. This comes from a third-party directory. — [mcp.so Mercury](https://mcp.so/zh/servers/mercury)
- Per a May 2026 piece, Mercury lets customers work with accounts from a terminal, and its MCP gives AI tools read-only financial context. Mercury's VP of Product Ryan Wiggins said early users are building "reports, burn-rate views and invoice flows". In other words, users DIY burn views on raw MCP, which validates Runway's thesis. — [implicator.ai editors' picks, May 1 2026](https://www.implicator.ai/editors-picks/)
- Mercury raised $200M at a $5.2B valuation (TCV) to focus on AI-native founders. — [bvwd.ca.gov repost](https://bvwd.ca.gov/expert-time/Mercury-Achieves-52-Billion-Valuation-in-Latest-Funding-Round-as-Fintech-Targets-AI-Startups-19-8585) (low-quality host; treat as unverified)

**Ramp**
- Price Intelligence uses Ramp transaction data to show whether a buyer is overpaying for software. It sits under Insights and draws on "spend data from thousands of Ramp customers and millions of Ramp transactions". Admins on Ramp Plus can enable it for custom roles. — [Ramp support: Price Intelligence](https://support.ramp.com/hc/en-us/articles/17522214341523-Price-Intelligence-on-Ramp)
- A Price Intelligence Chrome extension shows benchmark pricing (from similar businesses) while users browse SaaS pricing pages. — [Ramp blog: Price Intelligence extension](https://ramp.com/blog/price-intelligence-chrome-extension)
- Apr 2026: Ramp launched procurement AI agents for vendor sourcing, RFx generation and scoring, intake triage, compliance reviews and **renewal tracking**. The Q2 2026 release added purchasing agents, **token spend management** and Ramp Stack (an OS for accounting firms). Ramp also launched a corporate card for AI agents. Its "46 hours of manual purchasing work eliminated per month" figure is self-reported. — [search summary citing Crowdfund Insider / Fast Company / GIC](https://www.crowdfundinsider.com/?p=207415); [Fast Company Most Innovative 2026](https://www.fastcompany.com/91502967/ramp-most-innovative-companies-2026)
- Ramp agents connect through remote MCP inside an assistant or through the Ramp CLI in a shell. Both use browser OAuth and act as the signed-in user. — [agents.ramp.com docs](https://agents.ramp.com/docs/getting-started/how-agents-connect)
- Valuation: $44B Series F ($750M, June 2026, 70,000+ customers). An Oct 2026 report puts it at about $60B, and the pre- vs post-money basis is unclear. — [OTPP](https://otpp.com/en-ca/about-us/news-and-insights/2026/ramp-raises-series-f-at-44-billion-valuation/), [Hoodline](https://hoodline.com/2026/10/ramp-valuation-rises-about-36-to-60-billion-in-four-months/)
- Customer proof of duplicate-spend detection: Eight Sleep was "automatically notified of duplicative spend" and saved more than $5,000 on AWS. The case study also describes finding unused subscriptions bought by former employees. — [Ramp customer story: Eight Sleep](https://ramp.com/customers/eight-sleep)

**Brex**
- Brex agents: an **Audit agent** monitors expenses against internal processes and categorizes potential violations by risk level. A **Review agent** auto-approves low-risk expenses, escalates exceptions and follows up with anyone out of compliance. Users "upload your expense policy… agents will enforce your rules everywhere." — [Brex intelligence page](https://brex.com/intelligence), [Brex AI](https://www.brex.com/platform/brex-ai)
- The Expense, Review and Audit agents were released around the 2025 Fall Release (OnlyCFO saw the launch-day demo). — [OnlyCFO](https://www.onlycfo.io/p/real-ai-agent-use-cases-in-finance)
- Brex Assistant (Sept 2023, older) writes memos, fetches receipts, answers policy questions and files reimbursements. — [Crowdfund Insider 2023](https://www.crowdfundinsider.com/2023/09/213189-spend-management-fintech-brex-introduces-tool-to-streamline-work-processes-increase-productivity/)
- A Brex job post describes an "agent workbench", a conversational surface where finance teams work with Brex's agents. — [The Muse job posting](https://www.themuse.com/jobs/brex/ai-engineer-workbench)
- Capital One agreed in Jan 2026 to acquire Brex for about $5.15B. I did not confirm whether the deal has closed. — [AltexSoft](https://www.altexsoft.com/travel-industry-news/capital-one-buys-brex-pushes-ai-in-finance)
- Brex helps power OpenAI's global spend (Mar 2026 PR). — [Brex press](https://www.brex.com/journal/press/brex-helps-power-open-ai-global-spend-and-financial-operations)

**Digits**
- Digits Accounting Agents (June 23, 2025, older than the 2026 focus) run full workflows on its "Autonomous General Ledger": reconcile bank statements, manage work papers, categorize and book transactions, and process payroll. They pause for human input and run 24/7. Digits claims 95% automation of bookkeeping (company claim) and says it uses in-house specialized models rather than general LLMs. — [Accounting Today](https://accountingtoday.com/news/digits-says-its-new-ai-agents-can-automate-95-of-bookkeeping-tasks), [Insightful Accountant](https://blog.insightfulaccountant.com/digits-launches-ai-agents-for-its-autonomous-general-ledger)
- "Ask Digits" is a real-time AI assistant (natural-language Q&A over the ledger). — [Insightful Accountant](https://blog.insightfulaccountant.com/digits-launches-ask-digits-real-time-ai-assistant)

**Puzzle**
- Puzzle offers real-time burn, runway and cash for pre-seed to Series B. Metrics update throughout the month rather than only at close. AI features include Ask AI, AI Categorizer, auto-drafted reconciliations, completeness checks and auto-accruals, with a claimed ~98% auto-processing. Puzzle has dual-basis books (cash for founders, accrual for investors) and integrates with Stripe, Mercury, Ramp, Brex and Gusto. — [Puzzle blog](https://puzzle.io/blog/ai-accounting-software-startups), [Puzzle vs Digits](https://puzzle.io/blog/puzzle-vs-digits), [SoftwareConnect review](https://softwareconnect.com/reviews/puzzle-accounting-software/)
- A third-party review says users can build agents that draft categorization, reconciliation and close for human review, with a cap of 25 agents on the Starter and Core tiers. — [SoftwareConnect](https://softwareconnect.com/reviews/puzzle-accounting-software/)

**Runway Financial (now "CFO.ai") / Mosaic**
- Runway now operates as CFO.ai with an agent called **"Ari"** that works against a live financial model. As of Sept 2026, the Startup plan is $295/mo and includes Slack, **MCP**, alerts, and unlimited models and scenarios. Scenario planning branches main, upside, downside and custom cases to compare revenue, cash, margin, headcount and runway. Third-party pricing listings conflict. — [runway.com llm-info](https://runway.com/llm-info), [runway.com vs Mosaic](https://runway.com/vs/mosaic)
- Runway's own comparison page claims Mosaic was acquired by HiBob (vendor claim, unverified). — [runway.com compare Mosaic](https://runway.com/compare/mosaic)
- Name-collision risk: "Runway" is already an FP&A brand, and runway.com also redirects to the AI-video company. — inferred from [runway.com](https://runway.com/llm-info)

**SaaS management (Zylo, Vendr, etc.)**
- Zylo's 2026 SaaS Management Index: enterprises waste an average of $80.6M/yr on unused licenses, and 46% of SaaS licenses go unused in a given 30-day period. Another Zylo page gives $19.8M/yr for the "average organization", a different population. — [Zylo blog](https://zylo.com/blog/how-much-wasted-on-saas-spend), [Zylo license management](https://zylo.com/saas-license-management)
- Zylo's remedy is to match entitlements against user activity, then reclaim or reassign seats, including auto-deprovisioning through Okta SSO. — [Zylo Okta actions](https://zylo.com/blog/introducing-okta-actions-with-deprovisioning)
- CloudEagle (a Ramp competitor) detects duplicate and unused apps and auto-deprovisions low-usage licenses. — [CloudEagle](https://cloudeagle.ai/blogs/7-ramp-alternatives-and-competitors)
- Torii's method: compare contract lists, usage data and invoices to find overlap. Vendors sometimes credit unused months once duplication is shown, which is an actionable negotiation insight. — [Torii](https://www.toriihq.com/articles/find-duplicate-saas-subscriptions)
- Consumer and SMB tools (SubTracker, SubDupes) advertise price-hike alerts and duplicate detection (vendor claims). — [SubTracker](https://www.subtracker.io/?p=9643), [SubDupes](https://dolphinvoice.ai/en/ai-apps/subdupes-1097736)
- Other banks with MCP: Grasshopper (built with Narmi; Claude/ChatGPT) and Meow (claims MCP with money movement). — [Grasshopper support](https://support.grasshopper.bank/hc/en-us/articles/40312349814164-Claude-Integration), [Meow](https://www.meow.com/perspectives/mcp-server-business-banking-ai-agents)

### Inferences
- **Most-demoed features (pattern across vendors):** (1) a natural-language "ask your finances" chat (Ask Digits, Puzzle Ask AI, Ari, Brex workbench); (2) agents that take an action with a human-in-the-loop approval (Brex Review agent auto-approve vs escalate; Digits "pauses for input"); (3) a peer price benchmark ("you pay X, similar companies pay Y"); (4) scenario branches with a runway delta (Runway/CFO.ai). Runway should hit all four in one demo flow.
- **Positioning gap:** Ramp and Brex do waste and benchmarks only for spend on *their own cards*. Puzzle and Digits are ledgers that need an accountant workflow. Mercury and Rho expose raw MCP with no opinionated layer. A bank-native, read-only "runway + waste + action" agent that runs on a Rho token in 60 seconds, with no accountant and no card migration, looks unoccupied.
- **Read-only is a selling point.** Every bank MCP stresses read-only. Runway should pitch "we can't move your money, we tell you exactly what to cancel and file the ticket", which pairs well with the Jira/task output.
- Ramp's 2026 "token spend management" suggests **AI/LLM API spend (OpenAI, Anthropic, etc.) as a new waste category**. It is highly relevant for Austin AI-startup judges and detectable from bank descriptors.
- Since Rho has no webhooks, Autopilot should poll with an idempotent upsert on `transaction.id` and a rolling date window. Mention this as a deliberate design choice.

### Gaps
- Could not read the full Rho API reference: field names (merchant/counterparty, category, card ID, memo), rate limits, and whether the Rho MCP exposes cards or bill-pay data. docs.rho.co was blocked.
- Did not find primary docs for Ramp's specific SaaS features (renewal calendar, price-increase alerts, duplicate-vendor alerts). Only a customer story confirms duplicate detection. From prior knowledge (unverified here): Ramp launched "agents for controllers" in mid-2025 and has a "Ramp Intelligence" brand. I could not confirm this via search.
- No results for Cledara, Spendflo, Tropic, Finta, Pilot or Vendr's 2026 AI features. They were not searched individually due to tool budget.
- Brex agent launch date is only approximate ("2025 Fall Release"). The Capital One deal close status is unknown.

## Q2. What non-obvious insights do these tools surface, and which are derivable from bank transaction data alone?

### Takeaway
Seat utilization and renewal dates need SSO, contract or invoice data, which Runway won't have. But recurrence, price creep, duplicates, dormant subscriptions, annualized cost, FX/wire fees and category-overlap tools are all derivable from transaction rows alone, with cadence-clustering heuristics plus LLM merchant normalization.

### Cited Findings
- An open-source Claude skill, "recurring-charge-detector" (lyndonkl/claude), clusters same-merchant transactions of similar amount on a regular cadence. It requires at least 3 confirming occurrences before promoting a charge to recurring, uses tolerances such as monthly = 30 days ±4, detects **dormant subscriptions** and **amount drift** (price creep), and computes **annualized cost**. — [skills.sh recurring-charge-detector](https://www.skills.sh/lyndonkl/claude/recurring-charge-detector), [claudeskills.info mirror](https://claudeskills.info/ko/skills/lyndonkl/claude/recurring-charge-detector/)
- "Subscription Audit" scans local bank and credit-card CSV exports to detect recurring payments and **normalize messy merchant strings**, without bank logins. — [mcpmarket Subscription Audit](https://mcpmarket.com/tools/skills/subscription-audit)
- A Seren "recurring-transactions" skill recommends at least 3 months of history for accurate detection. — [skills.sh seren recurring-transactions](https://www.skills.sh/serenorg/seren-skills/recurring-transactions)
- Merchant descriptor variants matter. One vendor shows up as "GITHUB.COM", "GITHUB *COPILOT" and "MICROSOFT *GITHUB", so normalization must merge these. Slash and Weel publish merchant-descriptor identifier pages. — [Slash charge identifier](https://www.slash.com/charge-identifier/github), [Weel merchants](https://merchants.letsweel.com/merchants/github)
- Zylo's 46% unused-license figure is based on usage activity, which needs SSO or app telemetry, not bank data. — [Zylo](https://zylo.com/saas-license-management)
- Ramp's renewal tracking (part of the procurement agents) relies on contract intake. — [Crowdfund Insider](https://www.crowdfundinsider.com/?p=207415)

### Inferences
Derivable from Rho transactions alone (ranked by "wow per line of SQL"):
1. **Recurring/subscription inventory** with cadence (monthly, annual, weekly), next expected charge date and annualized cost (cadence clustering, ≥3 hits; annual needs 13+ months of history or a single large charge with an LLM vendor guess).
2. **Price creep:** the latest charge vs the trailing median for the same normalized merchant. Flag a rise of more than 5–10% and annualize the delta ("Notion went from $96 to $120/mo, +$288/yr").
3. **Duplicate or overlapping tools:** the LLM assigns each merchant a functional category (e.g., "video conferencing": Zoom + Google Meet add-on + Loom), then flags 2+ active tools in the same category.
4. **Duplicate charges:** same merchant and amount within N days, outside the normal cadence.
5. **Zombie / orphan subscriptions:** recurring charges whose amount never changes despite headcount changes, or charges on a card tied to a departed employee (only if the card or holder appears in the transaction data, which is unverified for Rho).
6. **Upcoming renewals calendar:** projected next charge dates from cadence, including a warning when a large annual charge is due within 30 days ("annual auto-renew warning").
7. **Annual-vs-monthly arbitrage:** for monthly SaaS, typical annual discounts of about 15–20% (general industry heuristic, not sourced here) give "switch to annual to save $X", but only recommend this if the tool is retained.
8. **AI/LLM token spend trend** (OpenAI, Anthropic, cloud GPU) as its own category with month-over-month growth. This is relevant for AI startups and mirrors Ramp's 2026 "token spend management".
9. **Fees leakage:** wire, FX and overdraft/returned-payment fees, plus failed or reversed payments (pending→returned) if the status field exists.
10. **Burn decomposition:** gross vs net burn, payroll vs non-payroll, fixed (recurring) vs variable. "X% of your burn is on autopilot" is a compelling non-obvious stat.
11. **Treasury idle-cash insight:** cash above N months of burn sitting in checking, compared with the Rho Treasury yield (up to 4.55% per Rho, 08/2026). This turns runway into extra interest, and it is sponsor-aligned.
Not derivable without other data: seat utilization, true contract renewal dates and notice periods, per-seat pricing (seat count unknown, though it can sometimes be inferred from amount ÷ known list price).

### Gaps
- Unknown whether Rho transaction objects include card ID or cardholder, MCC/category, or FX fields. This determines whether items 5 and 9 are feasible.
- No sourced number for the typical annual-vs-monthly discount.

## Q3. What SaaS pricing benchmark datasets exist?

### Takeaway
No open, downloadable SaaS price benchmark dataset was found. Vendr (free Chrome extension, partner APIs, paid premium) and Ramp Price Intelligence (customers only) are walled gardens. For a hackathon, hand-curate a small public list-price table and label it clearly as "list price".

### Cited Findings
- Vendr's free Chrome extension shows real-time pricing insights for 20,000+ products. The free tier includes SKU-level benchmarks for 50+ suppliers. Premium Intelligence (unlimited benchmarks) costs $10,000–$90,781/yr, with a median of $37,993/yr (272 purchases on AWS Marketplace). — [Vendr software prices](https://vendr.com/software-prices), [AWS Marketplace listing](https://aws.amazon.com/marketplace/pp/prodview-lnfw3az34qe3c)
- Vendr has developer APIs for **Price Benchmark** and **Price Estimate**. The estimates draw on 30,000+ contracts, and the OpenPrice embed is available for partners. — [Vendr developers: price benchmark](https://developers.vendr.com/docs/solution/price-benchmark), [price estimate](https://developers.vendr.com/docs/solution/price-estimate), [Vendr partner](https://www.vendr.com/partner)
- Vendr's dataset size is stated inconsistently ($3B, $4B or $5B+ of spend; 40,000+ negotiations; a third party cites 130,000 transactions). Benchmarks swing widely with deal scope, term and bundling. — [Vendr about](https://www.vendr.com/about), [ki-syndikat review](https://www.ki-syndikat.de/tools/vendr/)
- Ramp Price Intelligence is available only to Ramp customers (Insights tab; Plus tier for custom roles), and its Chrome extension shows peer pricing. — [Ramp support](https://support.ramp.com/price-intelligence-on-ramp), [Ramp blog](https://ramp.com/blog/price-intelligence-chrome-extension)

### Inferences
- Hackathon approach: seed a `vendor_catalog` table (about 40–80 common startup tools: Slack, Notion, Linear, Figma, GitHub, Google Workspace, Zoom, OpenAI, AWS, Vercel, HubSpot…) with the public list price per seat (monthly vs annual) and a functional category. With it, compute "implied seats = charge ÷ list price/seat" and "you're paying list; annual or volume tiers would save $X".
- A second option is an **anonymized cross-tenant benchmark** inside Runway ("companies your size spend median $X/mo on dev tools"). It is demoable with seeded synthetic peers, but must be labeled "synthetic" to avoid misleading judges.
- Vendr's partner API could be a "future work" slide. Do not rely on it for the hackathon (it needs a partnership).

### Gaps
- Could not verify whether Vendr's public `/software-prices` pages are scrape-friendly or what their terms allow.
- No open dataset (Kaggle, GitHub) of SaaS list prices was found in the searches run.

## Q4. Open-source / hackathon projects to learn from (2024–2026)

### Takeaway
Several Devpost "AI CFO / runway" projects and Claude skills for recurring-charge detection exist. None was confirmed as a hackathon winner, and none appears deep, so a working Rho-connected, end-to-end agent with SQL-grounded numbers would stand out.

### Cited Findings
- **RunwayPilot** (Devpost) is an AI CFO copilot for early-stage teams. It covers cash balance, burn, net cash flow, runway, anomaly detection and scenario planning, built with Next.js/TypeScript and NVIDIA NIM. No award was shown. — [devpost.com/software/runwaypilot](https://devpost.com/software/runwaypilot)
- **RunwayIQ** (Devpost) works from an uploaded CSV and produces a runway calculation, a risk score and a 3-month forecast through three sequential Claude API calls. — [devpost.com/software/runwayiq](https://devpost.com/software/runwayiq)
- **GhostCFO** is on Product Hunt (details not retrieved). — [hunted.space GhostCFO](https://hunted.space/product/ghostcfo)
- **cloudNein** ("empowers CFOs with instant, private financial AI") placed 2nd at the Google DeepMind x Cactus Compute hackathon (AI Tinkerers). — [AI Tinkerers results](https://sf.aitinkerers.org/hackathons/h_DRGnrtIWaG8/results)
- Claude skills for recurring detection: lyndonkl `recurring-charge-detector`, `Subscription Audit` and Seren `recurring-transactions` (details in Q2). — [skills.sh](https://www.skills.sh/lyndonkl/claude/recurring-charge-detector), [mcpmarket](https://mcpmarket.com/tools/skills/subscription-audit)

### Inferences
- Common weaknesses in prior hackathon CFO projects: CSV upload instead of a live bank connection, and LLM-computed numbers (RunwayIQ chains three LLM calls). Runway's "deterministic SQL for numbers, LLM only for categorization and narrative" plus a live Rho API is a direct, explainable differentiator. Say it explicitly in the pitch.
- Reuse candidates (if public more than 2 weeks before Oct 26 and licensed permissively): the cadence-tolerance table and the "≥3 occurrences" rule from `recurring-charge-detector`. These are ideas, not code, so they are safe to reimplement in SQL.

### Gaps
- Could not open Devpost or GitHub pages (blocked) to check dates, licenses, repos or awards. The GitHub MCP tool was not used, for budget reasons.
- No confirmed hackathon-winning AI-CFO project was identified.

## Q5. UX patterns that make these demos compelling

### Takeaway
The winning pattern is "one hero number + an explanation + a one-click action". Show runway in months with a date, show the drivers, and offer an approve/act inbox. Scenario branches and Slack/memo outputs prove it is a real workflow, not a dashboard.

### Cited Findings
- Scenario branches (main, upside, downside, custom) comparing revenue, cash, margin, headcount and runway, with Slack, MCP and alerts included even on the Startup plan. — [Runway/CFO.ai](https://runway.com/llm-info)
- An approval inbox with risk triage: auto-approve low risk, escalate exceptions, follow up on non-compliance. Violations are categorized by risk level. — [Brex intelligence](https://brex.com/intelligence)
- Policy-as-document: "upload your expense policy… agents enforce your rules." — [Brex AI](https://www.brex.com/platform/brex-ai)
- An in-context benchmark: a browser extension shows peer price on the vendor's pricing page. — [Ramp blog](https://ramp.com/blog/price-intelligence-chrome-extension)
- Continuous metrics (burn and runway updated through the month, not at close) and dual cash/accrual views. — [Puzzle](https://puzzle.io/blog/puzzle-vs-digits)
- Agents that "pause for human input" mid-workflow. — [Accounting Today on Digits](https://accountingtoday.com/news/digits-says-its-new-ai-agents-can-automate-95-of-bookkeeping-tasks)
- A conversational "workbench" where agents and humans work together. — [Brex job post](https://www.themuse.com/jobs/brex/ai-engineer-workbench)

### Inferences
- Recommended hero layout: **"Runway: 11.4 months → Mar 14, 2028 (zero-cash date)"**, with sparkline, net burn and a "+2.1 mo if you accept 6 recommendations" chip. The "if you accept" delta links waste detection directly to runway, which is the core non-obvious insight.
- **What-if sliders / goal-seek:** the Copilot handles "get me to 14 months without touching payroll" by solving a constrained optimization: pick a set of cuts from the waste list (excluding payroll), ranked by $/disruption, until runway ≥ 14. It shows the selected cuts as a checklist and recomputes runway in SQL. This "goal-seek agent" is more impressive than a slider.
- **Explainability:** every number links to the transactions behind it ("show me the 7 charges"). Judges value trust.
- **Outputs that prove "act tomorrow":** a monthly runway memo (markdown/PDF, board-update style), Jira/Linear tickets ("Cancel Loom, owner: @ops, saves $1,440/yr, due before Nov 12 renewal"), and a Slack digest. Show a ticket created live.
- **Autopilot run timeline:** a visible step log (sync 1,243 txns → categorized 98% → 9 findings → memo → 6 tickets) with durations. This doubles as the "performance" proof.

### Gaps
- No primary UX teardown or screenshots were retrieved (page fetches blocked). The patterns above are drawn from vendor descriptions.

## Q6. Ranked feature ideas for a 3-day build (demo impact vs effort)

### Takeaway
Build the "waste → runway delta → action" loop first. It is the differentiator that no incumbent ships bank-natively. Then add goal-seek Copilot and Autopilot outputs. Benchmarks and treasury are cheap add-ons with high "non-obvious" value.

### Cited Findings
- Supporting evidence for prioritization: Mercury users DIY burn views on MCP ([implicator.ai](https://www.implicator.ai/editors-picks/)); Ramp ships renewal-tracking and token-spend agents ([Crowdfund Insider](https://www.crowdfundinsider.com/?p=207415)); Brex ships approve/escalate agents ([Brex](https://brex.com/intelligence)); Runway/CFO.ai ships scenario branches ([runway.com](https://runway.com/llm-info)); recurring detection via cadence clustering is proven ([skills.sh](https://www.skills.sh/lyndonkl/claude/recurring-charge-detector)); Rho is read-only and has no webhooks ([rho.co/product/api](https://rho.co/product/api)).

### Inferences
Ranked list (Impact H/M/L ÷ Effort S/M/L; best ratio first):
1. **Runway hero + zero-cash date + "runway if you act" delta** (H/S). SQL net burn (trailing 3-month avg, excluding one-offs and transfers) and cash ÷ burn.
2. **Subscription inventory via cadence clustering + LLM merchant normalization** (H/M). The foundation for everything else.
3. **Price-creep detector** with annualized delta (H/S once item 2 exists).
4. **Duplicate/overlapping tools by LLM functional category** (H/S–M). A "you pay for 3 note-taking tools" card.
5. **Goal-seek Copilot** ("14 months without payroll"): a greedy cut-selection over findings plus SQL recompute, returning a checklist (H/M). This is the signature demo moment.
6. **Autopilot run with visible step timeline → monthly memo → Jira tickets** (H/M). Shows end-to-end agency, and the tickets are the "act tomorrow" proof.
7. **Upcoming-renewal / annual auto-renew warnings** (next expected charge within 30 days) (M–H/S).
8. **AI/LLM token-spend tracker** (OpenAI, Anthropic, GPU clouds) with month-over-month growth and per-model share if descriptors allow (M–H/S). Resonates with Austin AI founders and mirrors Ramp 2026.
9. **Treasury idle-cash insight** ("$X above 6 months of burn could earn ~$Y/yr in Rho Treasury") (M/S). Sponsor-pleasing, but phrase it as an estimate.
10. **List-price benchmark table + implied seats** ("~12 seats of Figma at list price; annual saves $Z") (M/M).
11. **Fees leakage** (wire, FX, returned payments) and **duplicate-charge** detection (M/S, if fields exist).
12. **Explainability drill-down**: every finding links to its source transactions (M/S). Builds trust.
13. **Slack digest** of the weekly or monthly memo (M/S).
14. **Approval inbox** for findings (accept, snooze, dismiss), which feeds back into categorization rules (M/M). Mirrors Brex's approve/escalate.
15. **Scenario branches** (base / hiring plan / cut plan) side by side (M/M–L). Lower priority, since goal-seek already covers the "wow".
Avoid in 3 days: seat-utilization via SSO, a contract/PDF renewal parser, Vendr API integration, anything that moves money (impossible with read-only Rho anyway).

### Gaps
- Effort estimates are team-judgment inferences, not sourced.
- The availability of Rho sandbox data volume and realism for the demo was not verified. A seeded synthetic dataset may be needed.
