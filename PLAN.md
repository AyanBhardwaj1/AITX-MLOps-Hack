# Runway: build plan

**One-liner:** Connect your Rho business account, and in 30 seconds Runway tells you your real burn, your runway, and exactly where the waste is. Then ask it "get me to 14 months" and it builds the plan.

**Event:** AITX & MLOps World Community Hackathon, Austin Tech Week
**Tracks (max 2 per submission):** 💳 **Rho Fintech** + 🤖 **Antler Agents**. Rho co-sponsors the Hack Fair, and Autopilot (§5) is our "real work end to end" story for Antler.
**Prizes:** Track winners get cash + $500 Supabase credits + a demo at the AITX meetup + dinner. Community Choice gets $250 + the meetup + dinner.
**Rule:** All code must be written during the hackathon (Oct 26 on). Open-source dependencies must have been public for 2+ weeks, which normal npm packages are.
**Submission deadline:** Thu Oct 29, 5:00 PM CT (Airtable form) · **Hack Fair:** Fri Oct 30, set up from 12:00 PM, judging 1:00 PM

---

## Status (updated Wed Oct 28, evening)

**Added Wednesday:**
- Monte Carlo cash forecast with P10–P90 band and a revenue −30% stress line.
- Renewals calendar with "decide" flags.
- AI-spend tracker.
- LLM fallback for unknown vendors.
- Fixes for both independent review rounds (savings no longer double-counted, per-card streams, abuse limits).
- Submission kit in [SUBMISSION.md](SUBMISSION.md).

Still needs keys or network: a live Copilot test, live Rho sandbox verification, Supabase wiring.

## Status (Tue Oct 27, early morning)

**Built and tested** (83 unit tests, eval at 100% precision and recall across 10 seeded runs, `npm run test:db` green, production build passing):
- Rho client and mapper, applying lessons from earlier Rho hackathon projects ([docs/prior-art.md](docs/prior-art.md)).
- Vendor normalization, recurring-charge detection and 4 waste detectors.
- Burn, runway and goal-seek.
- Seeded Taco Robotics company and the eval harness.
- Tenant-ready Supabase schema.
- Copilot (AI SDK v7 `ToolLoopAgent`) and the Autopilot pipeline with memo number-checking and Jira ADF.
- Dashboard with what-if, evidence drill-down and the Autopilot timeline.

**Research changes adopted** (full report: [reports/Runway fintech agent system design.md](reports/Runway%20fintech%20agent%20system%20design.md)):

| Was | Now |
|---|---|
| Seed is a fallback | Seed is the primary demo. Sandbox mode dates itself by its latest transaction (the feed ends June 2026). |
| Status `posted/pending`, key on `id` | Rho `settled/pending/failed/awaiting_approval` are mapped; failed rows are dropped; the key is `(account_id, id)`; card repayments count as transfers |
| Hand-rolled OpenAI loop | Copilot on Vercel AI SDK v7. Autopilot is a fixed plan-then-execute pipeline (prompt-injection defence). |
| `runs` table | OTel-shaped `agent_runs` / `agent_steps` with integer micro-dollar cost |
| Findings without idempotency | `unique(org_id, fingerprint)` on findings and actions; a trigger keeps agent actions draft-only |
| Pitch: "we find subscriptions" | Pitch: "we price waste in runway and turn it into owned tickets" (rhodesk already did subscription renegotiation) |

**Next, in order:**
1. With network and keys in the new session:
   - Verify the Rho sandbox mapping live.
   - Smoke-test Copilot with `OPENAI_API_KEY`.
   - Wire Supabase persistence (findings status, actions, agent runs).
2. Add the LLM fallback for unknown vendors (`gpt-6-luna`, cached by merchant key).
3. Add the renewal calendar and AI-spend tracker (cheap wins from the research).
4. Deploy to Vercel and record the Loom video.
5. Stretch: cached Apify pricing comparison, then Jira on a real Atlassian site.

**Note on dependencies:** packages are pinned to versions published at least 2 weeks before kickoff. The one exception is `next@16.4.1` (Oct 14), taken to patch critical remote-code-execution advisories in 16.4.0.

---

## 0. How we win: the judging criteria mapped to features

The judges say they score "real, working systems, not slide decks or simple API wrappers," across three things: **the live demo at the table, the Loom video, and the codebase.**

| Criterion | What judges look for | How Runway scores |
|---|---|---|
| **Completeness** | The core workflow runs without crashing | Sync → categorize → detect → simulate → plan works on both the sandbox and the seeded company. Feature freeze Wed at 9 PM. Every external call has a fallback. |
| **Technical depth** | A complex pipeline, not a wrapper | A multi-stage pipeline: Rho ingestion, LLM enrichment with a vendor cache, SQL detectors, a deterministic simulator, and a tool-using agent on top. The LLM never does the arithmetic. |
| **Insight quality** | Output is non-obvious and genuinely useful | Findings carry dollar amounts and evidence (the actual transactions). Duplicate-tool detection by job-to-be-done is something a spreadsheet can't do. |
| **Usability** | A real user could act on it tomorrow | Each finding comes with a drafted action (cancellation email, card-limit checklist, Jira ticket). Read-only Rho means it's safe to connect today. |
| **Creativity** | Novel combination of tools or data, looks and feels good | Banking data + scraped vendor pricing (Apify) + an agent. Polished shadcn UI with a live runway simulator. |
| **Performance** | Optimized for speed or scale | Vendor-level caching (each unique vendor hits the LLM once), batched categorization, indexed SQL views. **Measure it and show it**: sync and categorization timings on screen, and LLM calls saved by the cache in the README. |
| *(bonus for MLOps judges)* | — | **An eval harness**: the seeded company has planted waste, so we can report the detectors' precision and recall plus categorization accuracy against a labelled set. Put the numbers in the README. |

---

## 1. Constraints that shape the design

| Fact | Source | What it means for us |
|---|---|---|
| The Rho API is **read-only**. Tokens can't move money, issue cards or modify accounts. | Rho docs and product page | Runway **recommends and drafts** actions. It never executes them. We pitch this as a trust feature: "safe to connect, it can't touch your money." |
| Confirmed endpoints: `GET /accounts`, `/accounts/{id}`, `/transactions` (filter by account, type, status, date, search; cursor pagination), `/statements`, `/business`, `/users`. Cards are listed on the product page but not confirmed in the docs. | docs.rho.co | Transactions are the core input. Card-level insights are a stretch, used only if a Cards endpoint shows up. |
| The sandbox is `https://rhoapi-sandbox.rho.co/api/v1`, accepts **any non-empty bearer token**, and returns fictional, deterministic data. | docs.rho.co | We can build tonight without waiting on the access form. The sandbox data may be too thin for a compelling demo (see §7). |
| Production is `https://rhoapi.rho.co/api/v1` with scopes `accounts:read`, `transactions:read` and `statements:read`. | docs.rho.co | ✅ Access form submitted Mon Oct 26. If credentials or the Rho **SDK** arrive by email, swap the SDK in for our REST client. The `RhoClient` interface stays the same, so nothing else changes. |

## 2. Scope

### Must ship (MVP, done by Wed night)
0. **Autopilot** (for the Antler Agents track: "real work end to end, not a chatbot that only suggests"): one click, or a daily cron, runs the whole job without a human. It syncs from Rho, categorizes new transactions, re-runs the detectors, writes a monthly **Runway Review** memo, and files each finding as a task in the Runway inbox (and as a Jira ticket once that's wired up). Each run is logged with its steps, timings and outputs so judges can see what it did.
1. **Connect and sync:** Pull accounts and 6–12 months of transactions from Rho (sandbox) and store them in Supabase.
2. **Categorize:** The LLM normalizes vendor names, assigns a category and flags SaaS/recurring spend. Batched, with structured output.
3. **Burn and runway:** Monthly net burn (trailing 3 months), cash balance, runway in months, and a burn trend chart.
4. **Waste finder:** Three detectors, each producing a "finding" with a monthly dollar amount:
   - **Zombie subscriptions:** recurring charges from vendors with no other activity, or tools nobody mentions.
   - **Duplicate tools:** two or more vendors doing the same job (e.g. Zoom + Google Meet, Notion + Confluence).
   - **Price creep:** the same vendor charging more than it did 3 months ago.
5. **Runway Copilot:** A chat agent with tools over the data. It answers "how do I add 3 months of runway?" with a ranked plan, the projected new runway, and drafted actions (cancellation emails, a "lower this card limit in Rho" checklist).
6. **What-if simulator:** Toggle each finding on or off, and the runway number and chart update live. **This is the demo moment.**

### Stretch (Thu morning, only if the MVP is solid)
- **Cheaper-plan finder (Apify):** Scrape the pricing pages of the top 5–10 vendors, and have the LLM compare what you pay with the cheapest tier that fits.
- **Action export:** Push the approved plan to Jira as tickets (Atlassian sponsor) or email the founder a weekly digest.
- **Anomaly alerts:** A Supabase cron job that re-syncs daily and flags unusual charges.
- **Rho MCP connector** instead of our REST client.

### Explicitly out of scope
Moving money, auth beyond a single demo user, multiple companies, mobile.

## 3. Architecture

```
            ┌───────────────────────────── Next.js app (Vercel) ─────────────────────────────┐
 Browser ──►│  Dashboard (burn, runway, findings, what-if)     Copilot chat (streams)       │
            │        │                                              │                        │
            │  /api/sync ──► Rho API (sandbox → prod)               │                        │
            │  /api/categorize ──► OpenAI (structured output, batched)                       │
            │  /api/findings  (SQL detectors + LLM for duplicates)                           │
            │  /api/copilot ──► OpenAI tool loop ──► tools query Supabase                  │
            └──────────────────────────────┬─────────────────────────────────────────────────┘
                                           ▼
                         Supabase Postgres (+ Auth, + pg_cron for stretch)
                                           ▲
                        Apify actor (stretch): vendor pricing pages ──► pricing table
```

- **Language and stack:** TypeScript, Next.js (App Router), Tailwind + shadcn/ui, Recharts, `@supabase/supabase-js`, and the official `openai` SDK. One app, one deploy, so there's no separate backend to babysit.
- **Models (OpenAI, set by env var):** `OPENAI_MODEL_AGENT` = mid-tier GPT-6 (`gpt-6.1-sol`, about $2/$10 per 1M tokens) for the Copilot, Autopilot and duplicate detection. `OPENAI_MODEL_FAST` = the cheapest GPT-6 (`gpt-6-luna`, about $0.10/$0.50) for bulk categorization. We avoid the top tier (`gpt-6-astra`, about $10/$50). Confirm the exact IDs on OpenAI's pricing page; they're env vars, so changing them needs no code change.
- **Secrets:** Kept in `.env.local` and Vercel env vars only. Never committed: `RHO_API_TOKEN`, `RHO_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL_AGENT`, `OPENAI_MODEL_FAST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`.

## 4. Data model (Supabase)

```sql
accounts      (id text pk, name, type, balance_cents bigint, currency, synced_at)
transactions  (id text pk, account_id fk, posted_at date, amount_cents bigint,  -- negative = outflow
               counterparty_raw text, description, type, status, raw jsonb)
txn_enrichment(txn_id fk pk, vendor text, category text, is_saas bool,
               is_recurring bool, confidence real, model text, created_at)
vendors       (name pk, category, monthly_cost_cents, first_seen, last_seen,
               cadence text, pricing_url, cheapest_fit_plan jsonb)          -- Apify fills the pricing fields
findings      (id uuid pk, kind text check (kind in ('zombie','duplicate','price_creep','cheaper_plan','anomaly')),
               title, detail, vendors text[], monthly_savings_cents bigint,
               confidence real, status text default 'open')                 -- open | accepted | dismissed
plans         (id uuid pk, prompt text, finding_ids uuid[], new_runway_months real,
               actions jsonb, created_at)                                    -- Copilot output
```

Burn and runway are SQL views over `transactions`, which keeps them deterministic and keeps the LLM out of the arithmetic.

## 5. The Copilot agent

The agent is an OpenAI function-calling loop with Zod-validated tools. The model never does math in its head: every number comes back from a tool.

| Tool | What it does |
|---|---|
| `get_financial_snapshot()` | Returns the balance, trailing-3-month burn, runway and burn by category. |
| `query_transactions({vendor?, category?, from?, to?, min_amount?})` | Returns up to 50 matching transactions. |
| `list_findings({kind?, status?})` | Returns the waste findings with their monthly savings. |
| `simulate_plan({finding_ids[], extra_monthly_cuts_cents?})` | Returns the new burn and new runway. **Pure SQL, deterministic.** |
| `get_vendor_pricing({vendor})` | Returns the scraped pricing tiers (stretch). |
| `draft_action({kind: 'cancel_email' \| 'downgrade_request' \| 'card_limit_checklist' \| 'jira_ticket', vendor, details})` | Writes a draft into `plans.actions`. Nothing is sent automatically. |

**Autopilot** uses the same tools in an unattended loop with a fixed goal ("review this month and file actions"), plus `file_task({finding_id, title, body})`. Its run log (tool calls, durations, tokens) is stored in a `runs` table and shown in the UI.

The system prompt's core rules are:
- Every claim about money must come from a tool result.
- Reach the target runway with the fewest, lowest-risk cuts first.
- Never suggest cutting payroll or rent unless the user asks.
- End with a numbered plan, the projected runway, and the drafted actions.

## 6. Day-by-day plan

Times are Austin time. For a solo builder, do the rows top to bottom. With 2–3 people, split along **A (data/backend)**, **B (frontend)** and **C (agent/AI)**.

### Mon Oct 26, evening: foundations (~3 hrs)
- [x] **Submit the Rho API access form.**
- [ ] Join the hackathon Discord, where updates and Rho SDK details will appear.
- [ ] Redeem the Supabase credit, create the project, and run the schema migration from §4.
- [ ] Scaffold Next.js + Tailwind + shadcn and deploy an empty app to Vercel so CI/CD works from hour one.
- [ ] Hit the Rho sandbox with curl and **save sample responses**. Check: How many months of history? How many vendors? Is there SaaS-like spend? Is there a Cards endpoint? This decides whether we need §7's seed data.
- [ ] Make sure the GitHub repo is **public** (a submission requirement).

### Tue Oct 27: data and intelligence
- [ ] A: Write the Rho client (paginated `transactions`, `accounts`), build `/api/sync`, and upsert into Supabase.
- [ ] A: Write the demo seed script (§7) so we always have a rich dataset.
- [ ] C: Build `/api/categorize`, which batches 50 transactions per call with structured JSON output. Cache by `counterparty_raw` so each vendor is categorized once.
- [ ] A: Write the burn/runway SQL views, the zombie and price-creep detectors in SQL, and the duplicate-tool detector with the LLM (group vendors by job-to-be-done).
- [ ] B: Build the dashboard shell: runway hero number, burn chart, category breakdown and findings list.
- **End of day:** Sync → categorize → findings works end to end on seed data and shows in the UI.

### Wed Oct 28: Copilot and the demo moment
- [ ] C: Implement the Copilot tools from §5, the streaming chat endpoint and the chat UI.
- [ ] B: Build the what-if simulator, where toggling findings updates the runway number and chart live.
- [ ] C: Write about 10 test prompts ("get me to 14 months", "what changed since August?", "why is burn up?") and fix bad answers.
- [ ] A: Build the **eval script** (`npm run eval`). It scores detector precision and recall against the planted waste in the seed data and categorization accuracy against roughly 100 hand-labelled transactions, and prints a table for the README.
- [ ] A: Add timing instrumentation: show sync, categorization and detection durations in the UI, plus the share of LLM calls avoided by the vendor cache.
- [ ] Everyone: **Feature freeze at 9 PM.** Do a full demo run-through on the deployed URL.
- **End of day:** The full demo works on the deployed app.

### Thu Oct 29: polish and submit (hard stop at 4:00 PM)
- [ ] Morning: one stretch feature at most. Apify pricing is the recommended pick because it's the most visible.
- [ ] Polish: loading states, empty states, a "Connected to Rho, read-only" trust badge, and a favicon.
- [ ] **By noon:** record the **Loom demo video (3–5 min, Loom is required)** following the §8 script. It also serves as the backup if Friday's wifi dies. The organizers' advice is to record early.
- [ ] Write the README. The submission requires each of these:
  - [ ] Quick start (the commands to run)
  - [ ] Tech stack and architecture diagram
  - [ ] How to reproduce the demo: env vars, API keys, and a committed `.env.example`
  - [ ] Datasets and synthetic data with provenance: the Rho sandbox (fictional, from Rho) and the seeded "Taco Robotics" company (synthetic, generated by `scripts/seed.ts`)
  - [ ] Known limitations and next steps
  - [ ] *Ours:* eval results table, performance numbers, screenshots or a GIF
- [ ] Write the 150–300 word write-up: problem → who it helps → solution → impact (draft in §11).
- [ ] Fill in the team roster (names, roles, contacts) and the deployed Vercel URL.
- [ ] **Start the Airtable submission by 3:30 PM and submit by 4:00 PM.** The organizers say it takes 15–20 minutes, and the hard close is 5:00 PM. Tracks: **Rho Fintech + Antler Agents**. One submission per team.
- [ ] Post the project on X tagging **@AITXCommunity** and **@MLOpsWorld** for **2 free Community Choice votes**.

### Fri Oct 30: Hack Fair
- [ ] Arrive at 12:00 PM. Bring a laptop, a charger, a phone hotspot and the backup video on local disk.
- [ ] Print a QR code to the live app plus a one-page "how it works" sheet.
- [ ] Rehearse the 60-second and 3-minute versions of the pitch (§8).

## 7. Demo data strategy

Sandbox data is fictional and may be too sparse to show zombies, duplicates or price creep. So we build **"Taco Robotics, Inc."**, a seeded demo company in Supabase that uses the exact Rho transaction schema: 12 months of history, $84k a month burn, $940k cash, and deliberately planted waste:
- Zoom **and** Google Meet **and** Loom, all paid
- An unused Datadog plan that went from $1.2k to $1.9k
- 3 SaaS tools last touched by a contractor who left in June
- AWS creeping up 30% over the last 4 months

A toggle in the UI switches between the **Live Rho sandbox** and the **demo company**. We're upfront with judges that the demo company is seeded data.

## 8. Pitch and demo script (3 minutes)

1. **Hook (15s):** "Most startups die because they run out of money, and most founders can't tell you their runway to the month."
2. **Connect (20s):** Click "Connect Rho". It syncs, and the dashboard shows **11.2 months of runway** and **$84k a month burn**.
3. **Findings (40s):** "Runway found **$6,140 a month** in waste": duplicate video tools, zombie SaaS and Datadog price creep. Each finding is one click to expand and see the transactions.
4. **Copilot (60s):** Type "Get me to 14 months without touching payroll." It streams a ranked plan, the simulator updates live to **14.3 months**, and it drafts the cancellation emails.
5. **Trust and tech (30s):** It's read-only Rho, so it can never move money. Supabase for data and auth, GPT-6 for categorization and the agent, deterministic SQL for every number. Then show the eval table (detector precision and recall) and the timing panel. That answers "is this just a wrapper?" before anyone asks.
6. **Close (15s):** "Every founder at Antler should have this the day they open a bank account."

**Sponsor tech called out on the table sign:** Rho API, Supabase, Apify (if shipped), Atlassian/Jira (if shipped).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox data is too thin | The seeded demo company (§7), built on Tuesday rather than as an afterthought |
| Production Rho access never arrives | The sandbox needs no approval, so the demo doesn't depend on it |
| The LLM invents numbers | Every number comes from SQL via tools. The prompt forbids unsourced figures. |
| Categorization is slow or expensive | Cache by vendor (each unique vendor is categorized once), batch 50 at a time, cheapest model (`gpt-6-luna`) |
| Venue wifi dies on Friday | Phone hotspot, the backup video, and the seed data also available as a local JSON fallback |
| Scope creep | Feature freeze Wed at 9 PM. Stretch features only Thursday morning. |

## 10. Open questions
- [x] Tracks and judging criteria: we're entering Rho Fintech, and §0 maps the criteria to features.
- [ ] Team: solo, or recruit a frontend person on Discord?
- [ ] Does the sandbox expose a Cards endpoint? If so, add card-level findings, e.g. "this card's spend is all SaaS from an inactive cardholder."
- [ ] What does the Rho SDK look like when it arrives (language, auth), and does it cover more than the REST API?

## 11. Draft write-up (150–300 words, finalize Thursday)

> **Problem.** Running out of cash kills more startups than anything else, yet most early founders can't state their runway to the month. Their spend lives in a bank feed nobody reads, and SaaS waste such as duplicate tools, forgotten subscriptions and quiet price increases piles up unnoticed.
>
> **Who it helps.** Pre-seed and seed founders, and the fractional CFOs and accelerators (like Antler) who support them.
>
> **Solution.** Runway connects to a Rho business account through Rho's read-only API, so it can never move money. It ingests transactions into Supabase, uses an LLM to normalize vendors and classify spend, and runs deterministic detectors for zombie subscriptions, duplicate tools and price creep. Every finding comes with a dollar amount and the transactions behind it. A tool-using agent, the Runway Copilot, answers questions like "get me to 14 months without touching payroll." It builds a ranked plan, checks it against a deterministic runway simulator, and drafts the cancellation emails and card-limit changes to carry it out. Apify-scraped vendor pricing surfaces cheaper plans.
>
> **Impact.** On our demo company, Runway found $X/month in waste (+Y months of runway) in under Z seconds. Our eval harness shows P% precision on planted waste. A founder can connect it today and act on it tomorrow.

*(Fill in X/Y/Z/P from the real eval and timing numbers.)*
