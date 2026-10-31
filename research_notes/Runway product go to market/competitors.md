# Competitive landscape for "Runway" (read-only bank-connected burn/runway + SaaS-waste agent), as of 2026-10-31

Method note: WebFetch could not reach any site from this session. Every primary-source fetch failed with DNS errors (prnewswire.com, mercury.com, cpapracticeadvisor.com, ycombinator.com). So everything below comes from search-engine result summaries of the cited pages, not full-page reads. Treat exact prices and dates as "reported by the cited page" and confirm them on the vendor page before using them in a pitch. Items dated before 2025 are marked **[possibly stale]**.

## 1. What the startup banks and spend platforms offer (Rho, Mercury, Brex, Ramp)

### Takeaway
All four are pushing AI into their own dashboards. Ramp is far ahead on SaaS waste: it has seat intelligence, duplicate-subscription detection, procurement agents with price benchmarks, and AI token-spend controls. Mercury now shows cash, runway, AI cash-flow alerts and a chat assistant in the dashboard for free. Brex (now owned by Capital One) is focused on expense and accounting agents. Rho seems to have the thinnest built-in analytics, but it exposes a read-only API. That makes Rho a good first data source, and it also means Rho is the bank most likely to welcome or copy a third-party runway/waste layer. Each platform's insights only cover money that flows through that platform.

### Cited Findings
**Ramp**
- Ramp launched AI procurement agents on 2026-04-29. They cover intake, vendor sourcing, compliance checks and renewals, and can run whole sourcing events and find savings opportunities. — [PYMNTS](https://www.pymnts.com/news/b2b-payments/2026/ramp-launches-ai-agents-to-automate-corporate-procurement/); [This Week in Fintech](https://www.thisweekinfintech.com/p/ramp-launches-new-ai-agents-in-its-procurement-platform-for-better-purchasing); [CPA Practice Advisor](https://www.cpapracticeadvisor.com/2026/05/02/ramp-rolls-out-ai-agents-for-procurement/182627/)
- The agents use anonymized pricing benchmarks from Ramp's transaction data, tuned to company size and industry. Renewal alerts include price benchmarks, Okta seat usage, user-satisfaction signals and flagged contract terms. Ramp says procurement customers save 16% a year on vendor costs and 46 hours a month of manual work. These are company-reported figures. — [PYMNTS](https://www.pymnts.com/news/b2b-payments/2026/ramp-launches-ai-agents-to-automate-corporate-procurement/); [Owler](https://www.owler.com/reports/owler/Ramp--Ramp-Launches-Fleet-of-AI-Agents-Across-Its-Procurement-Platform/1776961275668)
- On 2026-06-10 Ramp launched "Applied AI Solutions", which helps enterprises deploy agents across AP, procurement, close, AR, expenses and token spend. — [PR Newswire](https://www.prnewswire.com/news-releases/ramp-launches-applied-ai-solutions-helping-enterprises-deploy-ai-agents-across-finance-operations-302796179.html)
- **Seat Intelligence** launched in January 2024 **[possibly stale]**. It compares software usage against billed seats through Okta (Ramp's example: 200 Asana seats billed, 100 active). Ramp marketing says the platform automatically detects duplicate subscriptions and flags unused services from spending patterns. One reviewer notes Ramp surfaces the savings, but a person still has to cancel or renegotiate. — [Ramp blog](https://ramp.com/blog/unused-software-subscriptions); [Contrary Research](https://research.contrary.com/company/ramp)
- **AI Token Spend Management** launched 2026-07-16. It covers Anthropic, OpenAI, Cursor and Gemini spend, suggests limits from observed usage, and claims savings of about 12% of monthly AI spend. Ramp says average monthly token spend across its customers is up 13x since January 2025. Ramp also has **Agent Cards** (cards issued to AI agents). Early access to **Glass** (an AI workspace with a cost meter) and Router opened 2026-10-13. — [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/ramp-launches-ai-token-spend-130000381.html); [cfotech](https://cfotech.news/story/ramp-launches-ai-token-spend-tool-for-finance-teams); [Ramp blog](https://ramp.com/blog/ai-agent-spending-controls); [Linas's Newsletter](https://linas.substack.com/p/weeklyfintechpulse420)
- Ramp Labs research found that coding agents ignore their own budgets, and concluded that spend approval should sit outside the agent doing the spending. — [Ramp Labs](https://labs.ramp.com/research/coding-agents-ignore-spend/)
- Pricing: Free is $0 per user (cards, expenses, AP, QBO/Xero sync). Plus is $15 per user per month, or $12 billed annually, plus an undisclosed platform fee. Plus adds NetSuite/Intacct sync, multi-entity and AI expense review. Enterprise is custom. — [Corpay summary of Ramp pricing](https://www.corpay.com/resources/blog/ramp-pricing); [adlega](https://adlega.com/compare/ramp-pricing/); [saaspare](https://saaspare.org/pages/ramp-pricing-2026-plans-costs-what-you-actually-pay)
- Scale: Ramp raised $1.85B at a $60B valuation in October 2026, after a round at $44B in June 2026. It reports more than 85,000 customers as of 2026-10-01, and Sacra estimates about $2B in annualized revenue. — [TechTimes](https://www.techtimes.com/articles/329137/20261016/ramp-raises-185b-60b-valuation-adding-ai-agent-cost-controls-its-platform.htm); [Sacra](https://sacra.com/c/ramp/)

**Mercury**
- **Mercury Insights** was announced as live in the dashboard in March 2026. It offers AI cash-flow alerts and a chatbot that answers questions about spending changes. — [Mercury blog, March 2026 product updates](https://mercury.com/blog/march-2026-product-updates)
- An August 2026 report says Mercury shows spend alongside cash position and **runway** in the same dashboard. It also says Mercury is putting AI agents "on the company spending line" and that its natural-language "Command" layer can check cash, manage spend or send invoices. Actions need user approval. — [FinTech Global](https://fintech.global/2026/08/12/mercury-puts-ai-agents-on-the-company-spending-line/); [PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/mercury-ceo-says-ai-is-breaking-the-old-startup-model/)
- **Mercury Books** (its ledger, with cash-flow reports) is free through 2026-12-31 and then listed at $35 a month. — [The Rundown](https://www.therundown.ai/tools/mercury-books)
- Mercury has also added AI payroll features to accounts. — [PYMNTS](https://www.pymnts.com/back-office/payroll/2026/mercury-integrates-ai-powered-payroll-capabilities-into-entrepreneur-accounts/)
- Scale: about $5.2B valuation after a $200M Series D led by TCV in May 2026. Sacra reports more than 300,000 customers as of February 2026 and about $650M in annualized revenue in 2025, with GAAP profitability. — [Sacra](https://sacra.com/c/mercury/); [Crowdfund Insider](https://www.crowdfundinsider.com/2026/04/271581-fintech-firm-mercury-reportedly-targets-5-billion-valuation/); [valueaddvc](https://valueaddvc.com/pulse/company/mercury)
- One site claims Mercury predicts burn with "~95% accuracy". The claim is unsourced and should not be used. — [businessmodelcanvastemplate](https://businessmodelcanvastemplate.com/blogs/growth-strategy/mercury-growth-strategy)

**Brex**
- **Capital One acquired Brex** for about $5.15B in cash and stock, announced 2026-01-22 and closed 2026-04-07. Brex now sits inside Capital One's Domestic Card business, and Pedro Franceschi still runs it. Brex's peak valuation was about $12.3B. — [Capital One 10-Q for Q1 2026 (SEC)](https://www.sec.gov/Archives/edgar/data/0000927628/000092762826000048/cof-20260331.htm); [Capital One 8-K (SEC)](https://www.sec.gov/Archives/edgar/data/927628/000119312526019543/d97758dex991.htm); [FinTech Weekly](https://www.fintechweekly.com/news/capital-one-acquires-brex-business-payments-fintech-deal)
- Brex runs an agent platform covering expenses, compliance (policy review), audit and accounting, built on the Brex Assistant it launched in 2023. Brex says it codes 99.7% of GL lines automatically and that about 70% of expenses are fully automated (company claims). It also has a ChatGPT app for spend questions. In March 2026 Brex announced it powers OpenAI's global spend. — [Brex press](https://www.brex.com/journal/press/brex-helps-power-open-ai-global-spend-and-financial-operations); [bankingnewsai](https://www.bankingnewsai.com/fintech/brex); [Procurement Magazine](https://procurementmag.com/news/how-brex-is-powering-agentic-finance)
- A procurement review site (low reliability) says Brex spend analytics give category-level visibility but are "not as sophisticated as dedicated spend analytics platforms". — [procurementaiagents.com](http://www.procurementaiagents.com/agents/brex.html)
- Brex bought Pry (budgeting/forecasting, YC) for about $90M in April 2022 **[possibly stale]**. — [FinTech Futures](https://www.fintechfutures.com/accounting-payroll/brex-acquires-bookkeeping-software-firm-pry-financials-for-90m)

**Rho**
- Rho's API is described as read-only by design: agents can query balances and transactions but cannot move money. One comparison says the API has been generally available to all Rho businesses since 2026-07-29 with no waitlist. — [Rho blog: best banking APIs](https://www.rho.co/blog/best-banking-apis-for-business); [Rho blog: best banks for AI startups](https://www.rho.co/blog/best-banks-for-ai-startups)
- Rho's cash-management features are treasury sweeps and yield. NerdWallet cites yields of about 3.02–3.79%, another review cites up to 3.93%, and the cash management account requires at least $350K. Rho Capital offers a revolving working-capital line with repayment up to 180 days. — [NerdWallet](https://www.nerdwallet.com/business/banking/reviews/rho-business-checking); [Rho treasury blog](https://www.rho.co/blog/treasury-management-software); [Rho AI-startup banks blog](https://www.rho.co/blog/best-banks-for-ai-startups)
- No search result showed a Rho-native runway forecast, burn view, AI insights or SaaS-waste feature.
- Name collision: the "Rho MCP server" (`@rholabs/rho-mcp`) belongs to **Rho X / rho.trading**, a trading company unrelated to Rho banking. Do not cite it as Rho banking. — [Rho X docs](https://docs.rho.trading/developer/rho-mcp-server)

### Inferences
- What's free or bundled for a seed-stage founder: Mercury's dashboard runway, cash-flow alerts and chat; Ramp Free's cards and expenses, with some SaaS insights (it is unclear which waste features are in Free versus Plus or Procurement); and Brex's assistant. A standalone tool cannot charge for "runway on a dashboard" alone.
- These platforms only see their own rails. Ramp sees Ramp card and bill-pay spend, Mercury sees Mercury accounts. A startup with a Rho or Mercury bank account plus cards from Ramp, Amex or Brex has no single place that sees all of it. That gap is the multi-bank, bank-agnostic wedge.
- Ramp is the most likely to fully copy the waste-plus-agent idea, and much of it is already shipped. It is not bank-agnostic, though, and its benchmarks and seat data depend on Okta and Ramp spend.
- Rho has no visible native insights layer and an open read-only API. It looks like a partnership or distribution target, for example an app listed on Rho or a co-marketing deal, and it is also the most exposed to a copy if the feature proves popular.

### Gaps
- Exactly which Ramp waste features (Seat Intelligence, duplicate detection, price intelligence, procurement agents) come with Ramp Free versus Plus or the Procurement add-on. No source found.
- Whether Mercury Insights forecasts forward (scenarios or ranges) or only shows current runway. Fetch of mercury.com failed.
- Rho's 2026 funding and customer counts. No results.
- No independent accuracy data for any platform's runway or alerts.

## 2. SaaS management and procurement tools (Vendr, Tropic, Cledara, Zylo, Spendflo, Productiv, Torii)

### Takeaway
This category is consolidating and moving up-market. Vertice acquired Vendr (June 2026) and Productiv shut down (August 2026). Most players are quote-based, priced around $10K to more than $100K a year, and detect waste through SSO, IdP and browser usage data plus contracts. Cledara is the main startup-priced option (from about $75 a month). Pre-seed and seed companies are largely unserved by dedicated tools.

### Cited Findings
- **Vertice acquired Vendr**, announced 2026-06-01, terms undisclosed. The combined data covers more than $75B in indirect spend across 32,000 vendors, with 60+ procurement AI agents and 1,000+ customers. Vendr customers move to Vertice's Intake-to-Procure platform. — [Tech.eu](https://tech.eu/2026/06/01/vertice-acquires-vendr-to-build-ai-powered-procurement-intelligence-platform/); [Vendr blog](https://www.vendr.com/blog/vendr-is-joining-vertice); [The Next Web](https://thenextweb.com/news/vertice-acquires-vendr)
- **Productiv shut down.** It notified customers on 2026-08-02, access ended 2026-08-05, and customer data was destroyed. It made an assignment for the benefit of creditors effective 2026-06-25. — [Tropic blog](https://www.tropicapp.io/blog/productiv-shut-down); [Zluri](https://www.zluri.com/blog/productiv-shuts-down); [Torii](https://www.toriihq.com/blog/why-did-productiv-shut-down); [1Password](https://1password.com/blog/productiv-shutdown-switch-to-1password-for-durable-ai-and-saas-management)
- **Vendr pricing** (third-party, conflicting): from about $12K a year, or three tiers of $36K–$120K a year. — [SpendHound](https://www.spendhound.com/blog/vendr-alternatives); [Spendflo](https://www.spendflo.com/blog/best-saas-procurement-software)
- **Tropic**: roughly $3,000–$3,750 a month to start; "Intake to Procure" listed at $14.5K a year; other reports say $10K–$24K a year. — [SpendHound](https://www.spendhound.com/blog/best-saas-spend-management-software); [lemsubs](https://lemsubs.com/blog/saas-spend-management-pricing-2026)
- **Spendflo**: quote-only. One report says the base is about $2,500 a month; mid-market deals run about $80K–$200K a year. — [najar.ai](https://najar.ai/blog/spendflo-alternatives); [varisource](https://www.varisource.com/blog/saas-spend-management-tools)
- **Cledara**: from about $75 a month for up to 20 apps, Pro from about $500 a month; one source says there is a free tier. It is the most startup-friendly option. — [Cledara vs Vendr](https://www.cledara.com/blog/vendr-vs-cledara); [lemsubs](https://lemsubs.com/blog/saas-spend-management-pricing-2026)
- **Torii**: Basic is about $2.50–$2.75 per employee per month with a minimum of about $250 a month billed annually. Professional and Enterprise are "contact us", and Enterprise is aimed at roughly 2,000+ employees. Basic includes discovery, expense tracking, integrations and a browser extension. — [Gart Solutions](https://gartsolutions.com/zluri-torii-zylo/); [G2](https://www.g2.com/products/torii/pricing); [Siit](https://www.siit.io/tools/trending/torii-review)
- **Zylo**: custom quotes scaled by employee count. Buyer-reported deals are about $50K–$150K a year mid-market and $300K+ enterprise (unverified). Zylo and Productiv have been described as charging about 3–8% of SaaS spend under management (unverified). — [VenduRIS](https://venduris.com/resources/vendors/zylo-vs-productiv); [SoftwareSeni](https://www.softwareseni.com/comparing-zylo-productiv-torii-and-vertice-for-saas-spend-management/)

### Inferences
- Detection approach: enterprise tools such as Zylo, Torii and Productiv rely on SSO/IdP (Okta, Entra), browser extensions and app integrations, plus finance and contract data. Pre-seed and seed startups often have no Okta and few seats, so those methods add little at that stage. Bank and card transaction data is the only universal signal for a 5–30 person startup. That supports Runway's bank-data-first approach (overlap, price creep, idle-card subscriptions, duplicates).
- Minimum spend for the dedicated vendors (Vendr, Tropic, Spendflo, Zylo) is around $10K a year or more, which is far above what a seed startup will pay to save a few thousand dollars. Cledara and Ramp are the realistic alternatives at the low end.
- The category is in turmoil: Productiv is gone and Vendr was absorbed. Torii, Zluri, Tropic and 1Password are actively trying to win Productiv's former customers, and the remaining players are moving up-market.

### Gaps
- Whether Cledara's free tier exists in late 2026 and which detection methods it uses (it is card-centric: virtual cards per subscription). Not verified.
- Funding and churn figures for Tropic, Zylo, Torii, Spendflo and Cledara in 2025–26. Not found.

## 3. Startup FP&A and runway tools (Runway.com/cfo.ai, Causal, Mosaic, Finta, Pry, Cube, Fathom, LivePlan, Jirav, Visible, Carta)

### Takeaway
The biggest news: **Runway Financial (Siqi Chen) rebranded to cfo.ai on 2026-09-10** and launched "Ari", an agentic AI CFO for founders, priced from about $375 a month. That is direct positioning overlap ("AI CFO for founders"). The "Runway" name is also freshly associated with that company, and with Runway AI (video), so naming and SEO collisions are a risk. The other FP&A tools are either absorbed (Causal into Lucanet, Mosaic into HiBob, Pry into Brex) or priced at roughly $1K–$2K+ a month, which is too high for pre-seed. Cheap options (LivePlan, Fathom) are for business plans or accountants, not live bank-driven runway.

### Cited Findings
- **cfo.ai / Ari**: Runway Financial became cfo.ai on 2026-09-10 and launched Ari. Ari connects to company systems, builds a live model, forecasts cash and runs scenarios. It works through Slack and integrates with QuickBooks, NetSuite and Stripe. The founder has said it works on top of closed books and does not close them. The old Runway pages redirect to cfo.ai. — [SiliconANGLE](https://siliconangle.com/2026/09/10/exclusive-ai-finance-cfo-ai-launches-an-agentic-cfo-for-business-founders/); [Yahoo Finance / PR](https://finance.yahoo.com/small-business/articles/cfo-ai-launches-ai-cfo-130000540.html); [Siqi Chen on X](https://x.com/blader/status/2098142732443386194); [cfo.ai/founders](https://cfo.ai/founders); [Aleph](https://www.getaleph.com/answers/runway-alternatives-financial-planning)
- cfo.ai pricing, as reported: Startup is $375 a month billed annually ($500 month-to-month), Growth is $1,125 a month annually ($1,500 monthly), Enterprise is custom. A 14-day trial is mentioned. The founders page offers a "first model, free"; another source says there is no free plan, so this is unresolved. — [aiagentslist](https://www.aiagentslist.io/agents/cfo-ai-ari); [aiaccountingvendors](https://aiaccountingvendors.com/vendors/cfo-ai); [cfo.ai/founders](https://cfo.ai/founders)
- **Causal** joined the Lucanet Group on 2024-10-31 **[possibly stale]** and became Lucanet's xP&A module. A 2026 listing says it is no longer sold standalone (third-party claim). — [Lucanet press release](https://www.lucanet.com/en/press-releases/causal-joins-the-lucanet-group-31-10-2024/); [Causal blog](https://www.causal.app/blog/causal-joins-the-lucanet-group); [aicentralresources](https://www.aicentralresources.com/tool/causal)
- **Mosaic** was acquired by HiBob, and its pricing page redirects there. Earlier estimates put it at about $2K–$6K a month for a roughly $3M ARR company. — [CFO Advisors](https://cfoadvisors.com/blog/mosaic-vs-runway-vs-cube-fpa-software-2026); [qubit.capital](https://qubit.capital/blog/best-financial-planning-softwares)
- **Cube**: about $1,250–$1,500+ a month, Excel-native, multi-entity. **Jirav**: about $10K a year (Starter), $15K a year (Pro), or about $2K a month by another estimate; has runway templates. **Fathom**: about $53 a month for one company file, built for accountants and advisors. **LivePlan**: about $15–$40 a month, for business plans and lender or investor forecasts. — [runfutureproof](https://www.runfutureproof.com/blog/cash-flow-forecasting-software); [Mammoth](https://mammoth.io/blog/financial-forecasting-software-tools/); [explodinggeo](https://www.explodinggeo.com/posts/best-fpa-forecasting-software-startups-2025); [rankite](https://rankite.com/blog/best-financial-forecasting-software); [plainhub](https://plainhub.app/cash-forecasting-software/)
- A Series A FP&A comparison called Runway (pre-rebrand) the "right default for most Series A startups under $5M ARR". — [CFO Advisors](https://cfoadvisors.com/blog/mosaic-vs-runway-vs-cube-fpa-software-2026)
- Small or new runway trackers exist: Parallel (early-stage, works from QBO or Puzzle), CentSight, StartupCFO. — [Parallel blog](https://getparallel.com/blog/best-forecasting-tools-for-founders-cash-runway-burn-rate-management); [CentSight](https://centsight.com/solutions/startups); [StartupCFO](https://www.gostartupcfo.com/)
- Benchmark mentioned in a vendor blog (rough): pre-seed AI startups burn about $25K–$60K a month; seed companies raising $2–4M plan for about $120K–$250K a month. — [cleoai.tech](https://cleoai.tech/knowledge/what_is_the_best_ai_startup_runway_planning_guide_for_founders_and_finance_teams_in_2026.php)

### Inferences
- cfo.ai is the closest "AI CFO for founders" brand competitor. It is model-centric (scenarios, built on top of the GL via QBO/NetSuite/Stripe), not bank-transaction-centric, and has no SaaS-waste angle in any source. At $375 a month or more, it leaves room for something cheaper, bank-native and focused on waste.
- Most FP&A tools need a ledger (QBO/Xero) and someone to maintain the model. Runway's approach of reading the bank account directly, with deterministic burn and a Monte Carlo range, avoids the "no bookkeeping yet" problem at pre-seed.
- **Naming risk:** "Runway" now points to cfo.ai's legacy brand and to Runway ML (video). Consider a distinct product name or domain.

### Gaps
- Visible.vc pricing, Finta pricing and status, and Carta's founder runway features in 2026. No search results.
- How cfo.ai is doing: no funding, customer or revenue figures found.

## 4. AI bookkeeping and "AI CFO" products (Pilot, Puzzle, Digits, Zeni, Kick, Basis, Rillet, Campfire, YC AI CFOs)

### Takeaway
AI bookkeeping is crowded and getting cheaper. Software runs about $25–$250 a month (Digits, Puzzle, Pilot's AI tier). Managed services run about $500+ a month (Zeni, Pilot teams). Mid-market AI ERPs (Rillet, Campfire) are quote-based. These products produce burn and runway as a byproduct of the ledger, but none of the sources position them on SaaS waste detection plus action drafting. YC has at least one bank-connected "AI CFO" (Blaze) doing Plaid-based recurring detection and runway projection, which is the closest functional clone of this product.

### Cited Findings
- **Digits**: about $65 and $100 a month, with a $250 Pro tier (sources disagree on whether it is live or "coming soon"; checked October 2026). — [beancount.io](https://beancount.io/blog/2026/08/16/ai-bookkeeping-software-compared-automated-categorization-receipt-reconciliation-cost-guide); [aistackguides](https://aistackguides.com/blog/best-ai-bookkeeping-software-2026)
- **Puzzle**: about $25–$100 a month (Scale from about $300), or plans from $30 a month with "Expert Reviewed" from $171 a month (conflicting). Puzzle reports 85–90% AI auto-categorization (internal figure). — [medianfi](https://medianfi.com/blog/ai-bookkeeping-tools-compared-2026); [Puzzle blog](https://puzzle.io/blog/startups-choose-mercury-banking-guide)
- **Pilot**: added an AI-only tier at about $99 a month; dedicated-team tiers from about $499 a month. — [guideguru](https://guideguru.dev/best-ai-bookkeeping-software-2026); [curatesuite](https://curatesuite.com/accounting/articles/ai-bookkeeping-software)
- **Zeni**: managed service, Starter from about $549 a month ($494 billed annually). — [finpresso](https://finpresso.com/reviews/best-ai-for-bookkeeping)
- **Kick**: free plan for one entity, up to 250 transactions a year. — [ledgermcp](https://ledgermcp.com/blog/best-ai-bookkeeping-software)
- **Rillet, Campfire**: quote-based AI-native ERPs/GLs for companies moving off QBO or NetSuite. — [catchingnumbers](https://catchingnumbers.com/blog/ai-accounting-software-compared-rillet-campfire-dualentry-digits/)
- **Basis**: raised $100M at a $1.15B valuation in February 2026. It is aimed at accounting firms, not SMB self-serve. — [rework](https://resources.rework.com/tools/ai-agents/best-ai-agents-for-bookkeeping-2026); [growthy](https://growthy.com/blog/ai-accounting-software)
- **Blaze (YC launch)**: an "AI CFO for businesses" that handles bill pay, invoicing, cash forecasting and bookkeeping. It connects to the bank through Plaid, finds recurring patterns and projects the balance to show runway. — [YC Launch: Blaze](https://www.ycombinator.com/launches/SFs-blaze-ai-cfo-for-businesses)

### Inferences
- Bookkeeping products already have the transactions and could add a "subscriptions and waste" tab cheaply. Puzzle and Digits are the most likely fast followers in the seed-startup segment.
- Runway's angle of no ledger needed, read-only bank access and approvals-first actions differentiates it from bookkeeping, but it could also be sold as an add-on to them. The accountant or fractional-CFO workflow could be a channel: Fathom's per-company pricing shows that advisors buy tools priced per client.

### Gaps
- 2025–26 funding for Pilot, Puzzle, Digits, Zeni, Kick, Rillet and Campfire: none found in this pass.
- Whether Digits or Puzzle currently ship explicit SaaS-waste or duplicate-subscription detection: not verified.
- Blaze's batch, pricing and funding: the page could not be fetched. A full list of 2024–26 YC "AI CFO" companies was not found (the YC directory was unreachable).

## 5. Threat assessment, the remaining wedge, and adoption/funding data

### Takeaway
Ramp could trivially copy most of the product, and has already shipped much of it (seat intelligence, duplicate detection, procurement agents, token-spend controls). Mercury already shows runway with AI alerts and chat. cfo.ai owns the "AI CFO for founders" message. The defensible wedge for a small entrant is the bank-agnostic layer across all of a startup's accounts and cards, for teams too small for SSO-based SaaS tools. Specific angles:
- Multi-bank and multi-card aggregation, starting with Rho, which has a read-only API and no native insights.
- An accelerator or VC portfolio view across many startups.
- Approval-gated actions that draft cancellation emails and tickets, rather than only surfacing insights.
- Pricing that is cheap or free for pre-seed, possibly distributed through banks or accelerators.

### Cited Findings
- Ramp's momentum, consistent with high copy capacity: $60B valuation, 85K+ customers, about $2B annualized revenue (October 2026). — [TechTimes](https://www.techtimes.com/articles/329137/20261016/ramp-raises-185b-60b-valuation-adding-ai-agent-cost-controls-its-platform.htm); [Sacra](https://sacra.com/c/ramp/)
- Mercury: 300K+ customers, about $5.2B valuation, profitable. — [Sacra](https://sacra.com/c/mercury/); [valueaddvc](https://valueaddvc.com/pulse/company/mercury)
- Brex: about 35K business customers (secondary), now part of Capital One. Integration expense was $96M in Q2 2026, so attention is likely on integration. — [Capital One 10-Q for Q2 2026 (SEC)](https://www.sec.gov/Archives/edgar/data/0000927628/000092762826000089/cof-20260630.htm); [pulse.bot](https://www.pulse.bot/saas/news/capital-one-to-acquire-brex-for-515b-0306c592-6565-4108-9b04-1d21c01c77b8)
- SaaS-management churn and consolidation signal: Productiv shut down (August 2026); Vendr was absorbed by Vertice (June 2026). — [Tropic](https://www.tropicapp.io/blog/productiv-shut-down); [Tech.eu](https://tech.eu/2026/06/01/vertice-acquires-vendr-to-build-ai-powered-procurement-intelligence-platform/)
- FP&A consolidation: Causal went to Lucanet (2024), Mosaic to HiBob, Pry to Brex (2022). Standalone startup FP&A has repeatedly ended in acquisition. — [Lucanet](https://www.lucanet.com/en/press-releases/causal-joins-the-lucanet-group-31-10-2024/); [CFO Advisors](https://cfoadvisors.com/blog/mosaic-vs-runway-vs-cube-fpa-software-2026); [FinTech Futures](https://www.fintechfutures.com/accounting-payroll/brex-acquires-bookkeeping-software-firm-pry-financials-for-90m)
- Ramp's own research supports keeping spend approval separate from the agent, which matches Runway's human-approval Autopilot design. — [Ramp Labs](https://labs.ramp.com/research/coding-agents-ignore-spend/)
- AI spend is a fast-growing waste category: Ramp says customers' average monthly token spend is up 13x since January 2025. — [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/ramp-launches-ai-token-spend-130000381.html)

### Inferences
Threat matrix (likelihood each player copies the "waste + runway agent", in my judgment):
- **Ramp: very high, mostly already done.** Limited to Ramp-routed spend plus Okta. Weak on bank-level runway across other banks.
- **Mercury: high for runway and alerts (done), medium for SaaS waste.** Profitable and AI-forward, but its scope is Mercury accounts only.
- **Brex/Capital One: medium to low in the near term**, given integration focus. Its card data covers waste on Brex cards only.
- **Rho: medium.** It could build this or partner. A read-only API plus no native insights layer makes Rho the best launch partner and the best "first bank".
- **cfo.ai: medium.** It could add a waste module. Its strength is modeling, not transactions, and it is priced from $375 a month.
- **Puzzle/Digits: medium to high.** They hold the transactions and target the same seed-stage founders.
- **SaaS-management vendors: low for the startup segment.** They are moving up-market.

Wedges that remain:
1. **Bank-agnostic, multi-bank, multi-card.** Unify Rho, Mercury, Ramp, Brex and Amex. No bank will build a view of a competitor's rails.
2. **Serving teams without SSO**, where card and bank data is the only signal.
3. **An accelerator, VC or fractional-CFO portfolio dashboard** showing runway and waste across a portfolio. No incumbent targets this; Visible is closest but was not verified.
4. **Approval-gated actions:** drafting cancellation emails, tickets and renegotiation scripts, not only flags.
5. **Explainable, deterministic numbers with a forecast range,** against black-box AI chat.
6. **Price** under about $50 a month, or free through a bank or accelerator. Incumbent alternatives are bundled for free (Mercury, Ramp) or cost $375+ a month (cfo.ai) or $10K+ a year (SaaS-management vendors).

Risk: "free in my bank dashboard" is the default competitor. Retention depends on catching recoverable waste the bank's own view cannot see, for example spend on another provider's cards or AI tools billed to personal cards.

### Gaps
- Public churn data for any of these products: none found.
- Adoption numbers for Mercury Insights or Ramp's procurement agents: not disclosed in the sources found.
- Funding for Blaze, Parallel or CentSight: not found.
