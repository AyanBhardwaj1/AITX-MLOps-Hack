# Sponsor/Partner Integrations for Runway: Rho, Apify, Atlassian Jira/Confluence, and Pricing Benchmark Sources

Research note, 2026-10-27. **Network caveat:** docs.rho.co, rho.co, rhoapi(-sandbox).rho.co, apify.com, docs.apify.com, api.apify.com and developer.atlassian.com were all **blocked** from this research container (proxy 403 / DNS failure). Rho facts therefore come from (a) web-search snippets of docs.rho.co / rho.co pages and (b) **open-source hackathon repos on GitHub whose authors probed the live Rho sandbox** (several from a prior "RhoHack", ~Sept 2026), including a checked-in copy of the full 72-row sandbox transaction feed that I analyzed directly. Apify facts come from Apify's own open-source docs repo, JS client repo and RAG Web Browser repo on GitHub. Jira facts come from search snippets of developer.atlassian.com plus third-party guides. Anything not verifiable is in Gaps.

## Q1. Rho API: endpoints, auth, params, response shapes, limits, sandbox data, SDK, MCP, and product roadmap

### Takeaway
Rho's public API (v1) is a small, **GET-only, read-only** REST/JSON API at `https://rhoapi.rho.co/api/v1` (sandbox `https://rhoapi-sandbox.rho.co/api/v1`, any non-empty bearer token) covering accounts, transactions, cards, statements and invoicing (customers/invoices), with cursor pagination (`page_size` 1–100 + opaque `page_token`/`next_page_token`), signed integer minor-unit amounts, `counterparty_name` (no merchant category, no counterparty id), ~60 req/min, no webhooks, and **no official JS SDK** (hand-roll a ~100-line fetch client). The sandbox is a **static set of 72 fictional transactions** with almost no SaaS spend (2 small card charges), so Runway must layer a clearly badged synthetic SaaS ledger on top of it to demo vendor-pricing optimization.

### Cited Findings

**Hosts, versioning, auth**
- Production list endpoint is `GET /api/v1/transactions` on host `rhoapi.rho.co`, bearer token in `Authorization` header; no cookie/API-key/signed-request alternatives; API is v1 served under `/api/v1/` — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions), [Rho docs: Authentication](https://docs.rho.co/docs/v1/auth) (via search snippets)
- Sandbox is `https://rhoapi-sandbox.rho.co/api/v1`, production `https://rhoapi.rho.co/api/v1`; sandbox serves fictional, deterministic data and accepts any non-empty bearer token — [Rho API reference](https://docs.rho.co/api/v1/openapi), [Rho docs: Getting started](https://docs.rho.co/docs/v1/getting-started) (via search snippets); confirmed in code by [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts) and [RhoHack README](https://github.com/evapisk/RhoHack)
- The OpenAPI JSON is served at `https://rhoapi-sandbox.rho.co/api/v1/openapi.json` (a team transcribed its TS types from it) — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts)
- Production tokens start with prefix `rhobat_` — [RhoHack README](https://github.com/evapisk/RhoHack)
- The `Bearer` scheme is matched case-sensitively — [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py)
- Tokens are read-only, limited to the read scopes selected at creation, and cannot initiate payments or modify accounts — [Rho product page: API](https://www.rho.co/product/api) (via search snippet)
- Scopes: auth docs list `accounts:read` and `statements:read` as available; transactions docs say requests need `transactions:read` and a token without it gets 403 — [Rho docs: Authentication](https://docs.rho.co/docs/v1/auth); [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions) (via search snippets). **These snippets conflict** on scope names; check each endpoint's Security section in the reference.
- Tokens require an expiration (max 1 year) — [Rho docs: Authentication](https://docs.rho.co/docs/v1/auth) (via search snippet); a third-party comparison claims auto-expiry after 45 days of inactivity and a cap of 20 active tokens per business (unverified) — search snippet, source not independently confirmed
- Errors are RFC 9457 problem-details JSON — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts)
- Every write returns `405 Method Not Allowed`; "fourteen read only GET operations across five resources" — [rhodesk README](https://github.com/manojmaheshwarjg/rhodesk)

**Endpoint list (paths relative to `/api/v1`)** — compiled from working client code; Rho docs index confirms Accounts, Transactions, Statements, Business pages exist ([search results listing docs.rho.co/docs/v1/accounts, /business, /statements, /transactions](https://docs.rho.co/docs/v1/business))
- `GET /accounts` → `{ accounts: [...], page: { next_page_token } }` — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts)
- `GET /transactions`, `GET /transactions/{transaction_id}` — [RhoHack rho_client.py](https://github.com/evapisk/RhoHack/blob/HEAD/backend/app/rho_client.py)
- `GET /cards` (list key `cards`) — [Clutch rho.ts](https://github.com/7dracoder/Clutch/blob/HEAD/src/integrations/rho.ts), [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py)
- `GET /statements` (list key `statements`) with `page_size` (1–100, default 20), `page_token`, and inclusive `period_end_after` filter — [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py); [Rho API ref: List statements](https://docs.rho.co/api/v1/openapi/statements/liststatements) (via search snippet)
- `GET /invoicing/customers` (key `customers`) and `GET /invoicing/invoices` (key `invoices`) — [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py)
- Rho's product page lists accounts, transactions, statements, cards and invoicing as GET resources, while the getting-started guide says the current release covers accounts and transactions only — search snippets of [rho.co/product/api](https://www.rho.co/product/api) vs [Getting started](https://docs.rho.co/docs/v1/getting-started) (**sources disagree**; code evidence above supports the broader list)
- A "Business" docs page exists ([docs.rho.co/docs/v1/business](https://docs.rho.co/docs/v1/business)), but one team states "Rho's v1 API exposes no business identifier" — [LockInVowe research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md)
- No vendors/bills/AP endpoints were found in any source.

**Transactions: query params and pagination**
- Docs: list endpoint filters by account, type, status, date range, search text, plus `user_id` and `card_id`; pages carry a cursor for the next page — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions) (via search snippet)
- Empirically working filters: `status`, `transaction_type`, `posted_after`, `initiated_after` (described as undocumented), `sort_by=initiated_at&order=asc`; default order newest-first; `page_size` 1–100 + opaque `page_token`; **unknown params are silently ignored** — [RhoHack README](https://github.com/evapisk/RhoHack), [RhoHack rho_client.py](https://github.com/evapisk/RhoHack/blob/HEAD/backend/app/rho_client.py)
- `sort_by` accepts `initiated_at | posted_at | amount`; `order` `asc | desc` — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts)
- `initiated_after` is a strict `>` filter — [RhoHack README](https://github.com/evapisk/RhoHack)
- An **empty** date filter value (e.g. `initiated_before=`) returns 200 with zero rows — never send empty filter keys — [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py)
- Page tokens are filter-bound (re-send identical filters while paging) — [RhoHack rho_client.py](https://github.com/evapisk/RhoHack/blob/HEAD/backend/app/rho_client.py)

**Transaction response fields** (TS type transcribed from the OpenAPI doc)
- `id, money_movement_id, account_id, account_name, account_type (checking|credit|investment|savings|rewards), amount {amount:int minor units, currency}, status (pending|settled|failed|awaiting_approval), transaction_type (string), counterparty_name, counterparty_logo_url?, initiated_at, posted_at?, memo?, note?, card_id?, card_name?, user_id?, user_full_name?, tracking_number?, attachments?: [{file_id, file_name}]` — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts)
- `memo` is not user-editable, `note` is user-editable; `tracking_number` = ACH trace or wire IMAD/OMAD for outbound; MT103 refs not returned; **`id` is not unique per row** (legs of one money movement can share an id) — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions) (via search snippet); key on `(id, account_id)` — [rhodesk rho.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/rho.py)
- Sign convention: positive = money into the account, negative = out; amounts are signed minor units, heavy-tailed ($7 → $1.3M in sandbox) — [LockInVowe research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md), [RhoHack README](https://github.com/evapisk/RhoHack). Verified in the fixture: card spend appears as e.g. `card_debit -1750 "Teamline Software, Inc."` on the Credit Account — [RhoHack sandbox fixture](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_transactions.json)
- **No merchant category / MCC field and no counterparty id** — only `counterparty_name`; internal transfers name the other account (e.g. "Cash (Checking)") — [RhoHack README](https://github.com/evapisk/RhoHack); the only taxonomy is `transaction_type` — [LockInVowe research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md)
- `posted_at` is null while pending/awaiting_approval, but Rho populates `posted_at` even on `failed` rows (so never sum failed rows into cash) — [RhoHack README](https://github.com/evapisk/RhoHack), [LockInVowe research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md)
- Account object: `id, account_type, account_name, account_number_last_4, routing_number_last_4, balance {amount,currency}, available_balance?` (`available_balance` marked internal, absent in sandbox) — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts), [research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md)
- Card object (from zod schema / fixture generator mirroring the API): `id, name, status, type, last_4`, plus `cardholder {first_name,last_name,user_id}, spending_limit {amount,currency}, spending_limit_type ("monthly"), current_spend, pending_spend, billing_address, shipping_address` — [Clutch rho.ts](https://github.com/7dracoder/Clutch/blob/HEAD/src/integrations/rho.ts), [rhodesk fixtures.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/fixtures.py) (the latter is a "field for field drop in replacement" per its README, but is generated, not captured)

**Rate limits / webhooks**
- ≈60 requests/min per token; 429 carries `Retry-After` — [RhoHack README](https://github.com/evapisk/RhoHack) (empirical); Rho docs have a "Rate limits" page about 429 retry but its numbers weren't retrievable — [Getting started](https://docs.rho.co/docs/v1/getting-started) (via search snippet)
- No webhooks ("Not yet") and read-only today, per Rho's own comparison table — [Rho blog: Best banking APIs for business](https://www.rho.co/blog/best-banking-apis-for-business) (via search snippet); "no diff endpoint, no removal channel, and no webhook" — [LockInVowe research packet](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/docs/SOURCE_LAYER_RESEARCH_PACKET.md)

**Sandbox contents (analyzed from the checked-in copy of the live feed)**
- Exactly 72 transactions, dated 2023-05-31 → 2026-06-26, identical on every call (static) — [RhoHack README](https://github.com/evapisk/RhoHack); my count of [the fixture](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_transactions.json) confirms 72 rows and that date range
- Status mix: 61 settled, 8 failed, 2 pending, 1 awaiting_approval. Types: card_debit 8, ach_debit 6, credit_repayment 6, ach_credit 5, wire_in/out 4 each, card_refund 4, rewards_accrual 4, internal_transfer 4, credit_repayment_refund 4, check_deposit 3, plus savings_*, ach_return, international_wire_out/fee, check_payment, adjustment_*, wire_fee — [fixture](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_transactions.json)
- Fields present: all rows have id/account/amount/status/type/counterparty/initiated_at; `memo`/`note` on 39, `user_id`/`user_full_name` on 38, `card_id`/`card_name` on 12 — [fixture](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_transactions.json)
- Counterparties are fictional (e.g. Harborline Logistics $12,500 awaiting approval "Q3 freight invoice", Summit Legal LLP, Northstar Office Supply, Island Resort Maldives $16,221.32, Canal House Bistro Amsterdam). **SaaS-like spend is only "Teamline Software, Inc." ($17.50) and "Cloudbridge Services LLC" ($18.50)** — [fixture](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_transactions.json)
- Accounts: ~14 accounts incl. multiple "Cash (Checking)" ($8,761.38 and $87,116.97), "Primary Checking" ($8,119.70), Reserve/Inventory/Treasury Checking, four zero-balance "Credit Account"s, Rewards, Savings — [RhoHack sandbox_accounts.json](https://github.com/evapisk/RhoHack/blob/HEAD/backend/fixtures/sandbox_accounts.json)
- A prior Rho-hackathon team building a **vendor/subscription renegotiation agent on Rho** found "the sandbox has only 72 transactions, too few for subscription detection to fire," and added synthetic vendors badged **demo** (an 18-month generated ledger, 273 txns, 10 vendors incl. a duplicate Asana subscription on two cards) — [rhodesk README](https://github.com/manojmaheshwarjg/rhodesk), [rhodesk fixtures.py](https://github.com/manojmaheshwarjg/rhodesk/blob/HEAD/rhodesk/fixtures.py)

**SDK, MCP/Claude connector**
- "Rho publishes an OpenAPI document but no JavaScript SDK" — [LockInVowe client.ts](https://github.com/AnuRaghav/LockInVowe/blob/HEAD/lib/source/rho/client.ts); a search for an npm Rho SDK found none — WebSearch (no result). (`rho-sdk` on docs.rs is an unrelated Rust crate — [docs.rs](https://docs.rs/rho-sdk/latest/rho_sdk/))
- Claude connector: in Claude open Customize → Connectors → Rho, sign in, select one business, review permissions, Authorize; one business per connection; read-only, scoped to account and transaction data; "deeper agent workflows are coming"; available to all Rho customers — [Rho help center: The Rho API](https://www.rho.co/help-center/the-rho-api), [Rho blog: Introducing the Rho API](https://www.rho.co/blog/introducing-rho-api) (via search snippets)
- Remote MCP URL listed by a third-party registry as `https://rhoapi.rho.co/mcp/v1` (unverified against Rho docs) — [skillsplayground Rho MCP connector](https://skillsplayground.com/connectors/co-rho-api/)
- Rho markets itself as "MCP-native" with partner OAuth — [Rho blog: Best banking APIs](https://www.rho.co/blog/best-banking-apis-for-business) (via search snippet; Rho's own, non-neutral ranking)

**Rho product (for roadmap alignment)**
- One platform: business checking, corporate cards, AP automation/bill pay, expense management, treasury; no monthly/per-user/platform fees; Rho is a fintech, not a bank (checking/cards via Webster Bank, N.A.) — [rho.co llms-full.txt](https://www.rho.co/llms-full.txt) (via search snippet)
- Bill pay: "pay hundreds of vendors in minutes with zero platform fees"; AI invoice scanning and automatic approval routing; receipt capture by email/text/photo — Rho marketing pages (via search snippets, [rho.co](https://rho.co/))
- Cards: no personal guarantee, up to 1.5% cashback — [rho.co llms-full.txt](https://www.rho.co/llms-full.txt) (via snippet)
- Treasury minimum conflicts: $50K (llms-full) vs $100K (blog); yield "up to 4.55% net, as of 08/03/2026" — [llms-full.txt](https://www.rho.co/llms-full.txt), [Rho blog: best banks for AI startups](https://www.rho.co/blog/best-banks-for-ai-startups) (via snippets)
- AP automation with GenAI invoice digitization launched Aug 2023 — [TechCrunch 2023](https://techcrunch.com/2023/08/01/as-spend-management-space-heats-up-brex-and-rho-turn-to-ai-startups-to-help-power-new-products)

### Inferences
- **Implementation recipe (TS):** write `lib/rho.ts` (~80 lines) over `fetch`: base URL from env, `Authorization: Bearer ${RHO_API_TOKEN}` (sandbox: any string like `sandbox`), generic `paginate(path, listKey, params)` looping on `page.next_page_token` with `page_size=100`, strip undefined/empty params, honor `Retry-After` on 429 with jittered backoff, zod-validate with `.passthrough()`. Fetch `/accounts`, `/cards`, `/transactions?sort_by=initiated_at&order=asc` once, cache in Supabase (`rho_transactions` keyed `(id, account_id)`). With 72 rows a full sync is 1–2 requests; no need to worry about the 60/min limit.
- **SaaS detection logic:** filter `amount.amount < 0`, `status in (settled,pending)`, `transaction_type in (card_debit, ach_debit)`; normalize `counterparty_name` (strip "Inc.", "LLC", ".COM", "*" processor prefixes) → vendor key; detect recurrence by ~monthly/annual cadence and amount stability; use LLM only to map normalized names to a known SaaS vendor + pricing-page URL. Exclude `failed` rows even though they carry `posted_at`.
- **Demo data strategy:** because the sandbox has only two ~$18 software charges, Runway needs a deterministic "demo overlay" ledger with realistic SaaS charges (Slack, Notion, Figma, Zoom, Asana duplicates, unused seats) in Rho's exact transaction schema, visibly badged "demo", merged with real sandbox rows. Being transparent about this (as rhodesk did) is what judges respect; disguising it would hurt.
- **Differentiation warning:** rhodesk (prior Rho hackathon) already did "find subscriptions → research current published pricing → renegotiate." Runway should differentiate on (a) autonomous scraped *plan-tier* comparison with evidence links, (b) seat-utilization/plan-fit math, (c) Jira workflow with owners and due dates, (d) a cash-runway impact number (savings → extra days of runway computed from Rho balances and burn).
- **Creative Rho angles that align with Rho's roadmap:** compute runway from `/accounts` balances minus trailing burn from `/transactions`; use `card_id`/`card_name`/`user_full_name` to attribute each SaaS subscription to an owner (who to assign the Jira ticket to) and spot duplicates across cards; use `/cards` `spending_limit` to recommend tightening a card's limit to the new plan price (a natural future write action once Rho opens writes); treat `awaiting_approval` rows as an "approve-before-you-pay" checkpoint ("this $X renewal is pending; a cheaper plan exists"); show the same answers via Rho's Claude MCP connector to demonstrate "MCP-native" fit. Frame every action as *recommendation + human approval*, mirroring Rho's read-only posture.
- Because tokens are read-only and there are no webhooks, the "autonomous agent" should run on a schedule (Supabase cron / Vercel cron) polling `initiated_after=<watermark>`, with a separate re-check of `pending` rows (strict `>` filter misses status changes).

### Gaps
- Could not read docs.rho.co directly: exact official endpoint list (e.g., whether `/business`, `/users`, `/statements/{id}/file` PDF download, `/transactions/{id}/files` attachments exist and their paths), full statement/invoice/customer schemas, the official rate-limit page numbers, and the authoritative scope names (`transactions:read` vs `accounts:read` conflict) are unverified.
- No evidence found of any **hackathon-specific Rho SDK** for this event (language/package name). If organizers provide one, it is not public on npm/GitHub search results as of today.
- The Rho MCP endpoint URL is from a third-party registry only.
- No 2026 Rho AI-agent product announcement found; roadmap beyond "deeper agent workflows are coming" is unknown.
- Whether the sandbox has changed since the Sept 2026 RhoHack snapshot is unverified (it was described as static).

## Q2. Apify: best actors for SaaS pricing pages, API/JS client, run-sync, cost, latency, gotchas

### Takeaway
For Runway's "fetch a handful of known pricing URLs and turn them into LLM-ready markdown" job, the best fit is Apify's own **RAG Web Browser** (or its sibling **URL to Markdown**) in **Standby mode** (HTTP GET, pay-per-event, ~16–30 s with browser rendering) or **Website Content Crawler** with `maxCrawlPages` small, called via `apify-client` (v2.25.0) or the `run-sync-get-dataset-items` endpoint, which hard-times-out at **300 s (HTTP 408)**. A $5/month free plan (or $25–50 sponsor credit) covers hundreds to thousands of pricing-page fetches; use `scrapingTool=browser-playwright` because most SaaS pricing pages are JS-rendered and toggle monthly/annual.

### Cited Findings
- `POST /v2/acts/{actorId}/run-sync-get-dataset-items` "Run Actor synchronously and get dataset items"; "If the Actor run exceeds 300 seconds, the HTTP response will return the 408 status code (Request Timeout)"; configure your HTTP client with a long enough timeout; accepts `timeout` and dataset feed params — [Apify OpenAPI spec (apify-docs repo)](https://github.com/apify/apify-docs/blob/HEAD/apify-api/openapi/paths/actors/acts@%7BactorId%7D@run-sync-get-dataset-items.yaml)
- Task variants also exist (`actor-tasks/{taskId}/run-sync-get-dataset-items`) — [apify-docs repo](https://github.com/apify/apify-docs/tree/HEAD/apify-api/openapi/paths/actor-tasks)
- JS client `apify-client` latest is **2.25.0** — [npm registry](https://www.npmjs.com/package/apify-client). `actor.call(input, opts)` waits indefinitely unless `waitSecs` is given; `start()` options: `memory` (MB), `runTimeoutSecs`, `waitForFinish` (max 60 s), `webhooks`, `maxItems` (pay-per-result cap), `maxTotalChargeUsd` (pay-per-event cost cap), `build` — [apify-client-js actor.ts](https://github.com/apify/apify-client-js/blob/HEAD/src/resource_clients/actor.ts)
- RAG Web Browser inputs: `query` (Google search keywords **or a URL**), `maxResults` (default 3), `outputFormats` (default `["markdown"]`), `requestTimeoutSecs` (default 40), `scrapingTool` (`raw-http` default in schema | `browser-playwright`), `removeElementsCssSelector` (defaults strip nav/footer/script/style/dialogs), `htmlTransformer`, `dynamicContentWaitSecs` (default 10), `removeCookieWarnings` (default true), `maxRequestRetries`, `proxyConfiguration` ({useApifyProxy:true}), `debugMode` — [rag-web-browser input_schema.json](https://github.com/apify/rag-web-browser/tree/HEAD/actors/apify_rag-web-browser)
- Standby mode: `GET https://rag-web-browser.apify.actor/search?query=...&token=...` returns results much faster and handles parallel requests; recommended for production/low latency — [RAG Web Browser README](https://github.com/apify/rag-web-browser/blob/HEAD/actors/apify_rag-web-browser/README.md), [Apify docs: Actor standby](https://github.com/apify/apify-docs/blob/HEAD/sources/platform/actors/running/actor_standby.md)
- Sibling actor **URL to Markdown** (`apify/url-to-markdown`, standby) takes a single `url` and `scrapingTool` — [rag-web-browser repo](https://github.com/apify/rag-web-browser/tree/HEAD/actors/apify_url-to-markdown)
- Latency benchmark: 4 GB/1 result 22 s; 4 GB/3 results 31 s; 8 GB/1 result 16 s; 8 GB/3 results 17 s; `raw-http` "up to 2x faster" for static sites; `browser-playwright` for JS-rendered sites; OpenAI custom actions have a 45 s limit — [RAG Web Browser README](https://github.com/apify/rag-web-browser/blob/HEAD/actors/apify_rag-web-browser/README.md)
- Pricing is pay-per-event: Search (once per Google query), Fetch (once per page, incl. pages with no text), Actor start (per GB memory, not charged for standby requests); passing a URL as `query` skips the Search charge; failed page loads aren't charged — [RAG Web Browser README](https://github.com/apify/rag-web-browser/blob/HEAD/actors/apify_rag-web-browser/README.md)
- In `raw-http` mode only links in the raw HTML are seen; browser mode reads the page after JS has run; images/fonts/media are blocked in browser mode — [RAG Web Browser README](https://github.com/apify/rag-web-browser/blob/HEAD/actors/apify_rag-web-browser/README.md)
- Website Content Crawler (`apify/website-content-crawler`) crawls multi-page sites to markdown and integrates with LangChain (`ApifyWebCrawlerTool`) and LlamaIndex — [Apify docs: LangChain integration](https://github.com/apify/apify-docs/blob/HEAD/sources/platform/integrations/ai/langchain/langchain-integration.md), [Apify docs: n8n WCC](https://github.com/apify/apify-docs/blob/HEAD/sources/platform/integrations/workflows-and-notifications/n8n/website-content-crawler.md)
- Free plan: $5/month usage, no credit card, no rollover, runs blocked when exhausted; CU price $0.20–0.30 on Free (cached copies of the pricing page disagree); Starter $29, Scale $199 (~$0.16/CU), Business $999 (~$0.13/CU) — [Apify pricing.md](https://apify.com/pricing.md), [use-apify.com free plan](https://use-apify.com/docs/what-is-apify/apify-free-plan) (via search snippets)
- WCC cost per 1,000 pages: no official flat figure; third-party estimates $0.20/1K (HTTP) to $0.50–5/1K (browser); an Apify blog test measured ~$0.12–0.13 for 1,000 URLs without JS — [use-apify.com guide](https://use-apify.com/docs/how-to-use-apify/scrape-website-content), [Apify blog: Crawl4AI vs WCC](https://blog.apify.com/crawl4ai-vs-website-content-crawler/) (via search snippets)

### Inferences
- **Recommended call for a known pricing URL (TS):**
  ```ts
  import { ApifyClient } from 'apify-client';
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const run = await apify.actor('apify/rag-web-browser').call(
    { query: 'https://slack.com/pricing', maxResults: 1, outputFormats: ['markdown'],
      scrapingTool: 'browser-playwright', dynamicContentWaitSecs: 15, requestTimeoutSecs: 60 },
    { waitSecs: 120, maxTotalChargeUsd: 0.5 });
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  // items[0].markdown -> OpenAI structured output: {plans:[{name, price_monthly, price_annual, per_seat, limits}]}
  ```
  Or plain REST: `POST https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=...` with the JSON input (note `~` replaces `/` in actor IDs in URLs — standard Apify convention, not re-verified here).
- **Cost math:** pricing pages are 1 URL each; even at browser-rendered rates of a few dollars per 1,000 pages, 20 vendors × a few re-runs is well under $1, so the $5 free tier or $25–50 sponsor credit is ample. Set `maxTotalChargeUsd` to guarantee it.
- **Gotchas for SaaS pricing pages:** prices often render client-side, sit behind monthly/annual toggles, vary by geo/currency, and hide "Enterprise: contact sales"; use browser mode, a US proxy, longer `dynamicContentWaitSecs`, and have the LLM extract both billing periods and flag "contact sales". Cache results in Supabase with timestamp + source URL; serve the cache during the live demo (Vercel functions have their own timeouts; never block a demo on a 16–30 s scrape).
- **Impress-the-sponsor ideas:** (1) Use RAG Web Browser's *search* mode for discovery ("<vendor> pricing") when the URL is unknown, then pin the URL. (2) Schedule an Apify task to re-scrape weekly and diff plan prices → "price-change alert" Jira tickets (shows Apify Schedules + webhooks). (3) Store raw markdown snapshots as evidence linked from each Jira ticket. (4) Expose Apify as an OpenAI tool so the agent decides when to scrape. (5) Optionally publish a tiny "SaaS Pricing Extractor" actor to the Apify Store that returns normalized plan JSON — a tangible contribution to Apify's ecosystem.

### Gaps
- Exact current per-event prices for RAG Web Browser and exact CU consumption/price for Website Content Crawler on the official Store pages could not be fetched (apify.com blocked).
- Website Content Crawler's full input schema (e.g., `crawlerType`, `maxCrawlPages`, `saveMarkdown`, `clickElementsCssSelector`) was not verified from a primary source in this session; its source repo is not public.
- Anti-bot behavior on specific vendors' pricing pages (Cloudflare-protected ones) is untested.

## Q3. Atlassian Jira Cloud REST API v3 (and Confluence) for filing findings

### Takeaway
Create tickets with `POST https://<site>.atlassian.net/rest/api/3/issue` using Basic auth (`email:api_token`, base64), body `{fields:{project:{key}, summary, issuetype:{name}, description:<ADF doc>}}` → 201 `{id, key, self}`; `description` must be **ADF**, not a string (400 otherwise), and keep it well under ~32K chars. API-token traffic is exempt from the new (Mar 2026) points-based hourly quotas and only subject to burst limits (429 + `Retry-After`). Use `jira.js` (6.3.0) or raw fetch; use `md-to-adf` or hand-built ADF. Confluence v2 `POST /wiki/api/v2/pages` with `representation: "storage"` is the easy path for the monthly memo.

### Cited Findings
- Endpoint `POST /rest/api/3/issue` (Cloud); v2 `/rest/api/2/issue` accepts plain-text descriptions; required fields are project key, summary, issue type; success returns HTTP 201 with the new issue's id and key; use `GET /rest/api/3/issue/createmeta` to discover allowed fields/issue types — [ones.com: using REST API to create Jira issues](https://ones.com/blog/using-rest-api-to-create-jira-issues-full-workflow-explained/) (third-party, via search snippet)
- `description`, `environment` and textarea (multi-line) custom fields take Atlassian Document Format; single-line custom fields take plain strings — [Jira Cloud REST v3: Issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) (via search snippet)
- Sending a plain string as description to v3 returns 400 — [atlassian-cli.pages.dev guide](https://atlassian-cli.pages.dev/blog/jira-rest-api-guide) (third-party, via snippet)
- Descriptions over 32,767 characters fail with `CONTENT_LIMIT_EXCEEDED` and still increment the project issue counter — [JRACLOUD-78553](https://jira.atlassian.com/browse/JRACLOUD-78553); ADF bodies over 1MB are rejected — [JRACLOUD-98152](https://jira.atlassian.com/browse/JRACLOUD-98152)
- Auth: create an API token in your Atlassian account and use Basic auth; token can't be retrieved after creation; OAuth recommended for larger apps — [Atlassian developer blog](https://blog.developer.atlassian.com/?p=2336) (via snippet)
- Rate limiting: points-based and tiered quotas enforced from **March 2, 2026** for Forge, Connect and OAuth 2.0 (3LO) apps; "API token-based traffic is not affected by this change, and will continue to be governed by existing burst rate limits"; writes like `POST /rest/api/3/issue` cost 1 point; burst limits are per tenant and per API path → HTTP 429 until tokens refill; honor `Retry-After`; there is also a per-issue write limit — [Jira Cloud rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/), [Build an app that respects rate limits](https://developer.atlassian.com/cloud/jira/platform/build-an-app-that-respects-rate-limits/) (via snippets)
- npm: `jira.js` 6.3.0 ("Modern Jira REST API client for JavaScript and TypeScript"), `md-to-adf` 0.6.4 (GitHub Markdown → ADF), `@atlaskit/adf-utils` 20.9.79 (builders/traversal) — [npm registry: jira.js](https://www.npmjs.com/package/jira.js), [md-to-adf](https://www.npmjs.com/package/md-to-adf), [@atlaskit/adf-utils](https://www.npmjs.com/package/@atlaskit/adf-utils)
- Confluence v2: `POST /wiki/api/v2/pages` with `spaceId`, `status`, `title`, optional `parentId`, and `body: {representation, value}`; representations `storage`, `atlas_doc_format`, `wiki`; send inner HTML only (wrapping in `<body>` caused problems) — [Atlassian community thread](https://community.developer.atlassian.com/t/confluence-rest-api-v2-struggling-to-create-a-page-with-the-new-editor/75235), [Windmill Confluence script](https://hub.windmill.dev/scripts/confluence/22508), [resumelens blog](https://www.resumelens.org/blog/confluence/confluence-rest-api-and-adf) (non-official)

### Inferences
- **Minimal TS (raw fetch):**
  ```ts
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  await fetch(`https://${process.env.JIRA_SITE}.atlassian.net/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      project: { key: 'RUN' }, issuetype: { name: 'Task' },
      summary: 'Switch Notion from Business to Plus — save $1,440/yr',
      labels: ['runway', 'saas-savings'],
      description: { type: 'doc', version: 1, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Rho shows 12 seats × $20/mo on card •1234 …' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Evidence', marks: [{ type: 'link', attrs: { href: 'https://notion.so/pricing' } }] }] } ] } } }) });
  ```
  ADF node shapes (`doc`/`paragraph`/`text`, `link` mark, `heading`, `bulletList`, `table`) are standard ADF; verify against Atlassian's ADF docs. Issue type names ("Task" vs "Story") depend on the project template — call `createmeta` once at setup.
- **Free-tier setup (≈10 min):** sign up for Jira Free at atlassian.com → create a Scrum/Kanban "team-managed" software project with key e.g. `RUN` → create API token at id.atlassian.com (Security → API tokens) → env vars `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`. (Free plan's user cap—commonly cited as 10—was not confirmed in this session.)
- **Idempotency:** before creating, search for an existing open ticket by a stable label/fingerprint (e.g., JQL `labels = runway-<vendorKey>` via `/rest/api/3/search/jql`) so the autonomous agent doesn't spam duplicates on every cron run; comment on the existing ticket when the price changes instead. (Endpoint name for JQL search changed in 2025; verify.)
- **Judge-pleasers:** custom field / label for `annual_savings_usd`; assign to the cardholder from Rho's `user_full_name`; set due date before the next renewal date inferred from charge cadence; link Apify evidence snapshot; transition tickets to Done when the next Rho charge shows the lower price (closed-loop verification); one Confluence "Monthly Runway Memo" page per month with a savings table and links to all tickets; show a Jira dashboard/filter "Savings pipeline" in the demo.

### Gaps
- Official ADF schema docs, exact burst-limit numbers, and the Jira Free plan's current user/feature limits could not be fetched (developer.atlassian.com blocked).
- Whether Atlassian (if a sponsor) expects use of Forge or Rovo agents rather than REST was not determinable.

## Q4. Other free data sources for SaaS vendor pricing benchmarks (and ToS caveats); Loom/X logistics

### Takeaway
Vendr is the strongest free benchmark source (free SKU-level benchmarks for 50+ suppliers, Buyer Guides for 250+, a free Chrome extension, a developer "price benchmark" API), but its data is self-reported and gated; scraping vendors' own public pricing pages (via Apify) remains the most defensible primary source. No ToS details for Vendr/G2 scraping were found, and nothing relevant was found on Loom/X submission logistics.

### Cited Findings
- Vendr free plan: SKU-level benchmarks for 50+ suppliers and Buyer Guides for 250+ suppliers ("Free Forever") — [Vendr on AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-lnfw3az34qe3c) (via snippet)
- Vendr Chrome extension (beta) shows benchmarks for 180+ suppliers; product page claims 20,000+ products, "100% free" — [Vendr Chrome integration](https://www.vendr.com/integrations/google-chrome) (via snippet)
- Vendr has a developer "price benchmark" solution doc — [developers.vendr.com: price benchmark](https://developers.vendr.com/docs/solution/price-benchmark) (title only from search; access terms unknown)
- Vendr's data comes from aggregated, anonymized buyer data; claims of $3B–$5B+ spend analyzed vary across its pages; revenue comes from seller-side "Price Checks" — [Vendr About](https://vendr.com/about), [Vendr Price Checks](https://www.vendr.com/vendr-price-checks), [Vendr blog: Vendr is now free](https://www.vendr.com/blog/stop-overpaying-for-software-vendr-is-now-free) (via snippets)
- Vendr public software price pages exist at [vendr.com/software-prices](https://vendr.com/software-prices) (via search result title)

### Inferences
- Use vendors' own public pricing pages (scraped via Apify) as the authoritative list price, and optionally cite Vendr's free public buyer-guide pages as a "negotiation benchmark" link inside the Jira ticket rather than scraping Vendr/G2 at scale (review sites typically restrict automated scraping in their ToS — verify before use).
- A small hand-curated `vendors.json` (vendor → pricing URL → aliases as they appear in `counterparty_name`) for ~15 common startup SaaS tools is the most reliable hackathon approach; LLM fallback for unknown names.

### Gaps
- No primary-source ToS text for Vendr, G2 or Capterra regarding scraping was retrieved.
- Access requirements (key/partner-only?) for Vendr's developer price-benchmark API are unknown.
- Loom/X submission logistics for this hackathon: no information found in this session (out of the reachable sources); check the event's Devpost/Luma page.
