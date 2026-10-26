# Runway: build plan

**One-liner:** Connect your Rho business account, and in 30 seconds Runway tells you your real burn, your runway, and exactly where the waste is. Then ask it "get me to 14 months" and it builds the plan.

**Event:** AITX & MLOps World Community Hackathon, Austin Tech Week
**Submission deadline:** Thu Oct 29, 5:00 PM · **Hack Fair:** Fri Oct 30, set up from 12:00 PM, judging 1:00 PM

---

## 1. Constraints that shape the design

| Fact | Source | What it means for us |
|---|---|---|
| The Rho API is **read-only**. Tokens can't move money, issue cards or modify accounts. | Rho docs and product page | Runway **recommends and drafts** actions. It never executes them. We pitch this as a trust feature: "safe to connect, it can't touch your money." |
| Confirmed endpoints: `GET /accounts`, `/accounts/{id}`, `/transactions` (filter by account, type, status, date, search; cursor pagination), `/statements`, `/business`, `/users`. Cards are listed on the product page but not confirmed in the docs. | docs.rho.co | Transactions are the core input. Card-level insights are a stretch, used only if a Cards endpoint shows up. |
| The sandbox is `https://rhoapi-sandbox.rho.co/api/v1`, accepts **any non-empty bearer token**, and returns fictional, deterministic data. | docs.rho.co | We can build tonight without waiting on the access form. The sandbox data may be too thin for a compelling demo (see §7). |
| Production is `https://rhoapi.rho.co/api/v1` with scopes `accounts:read`, `transactions:read` and `statements:read`. | docs.rho.co | We still submit the access form so we can say "works on a real account" and possibly demo one. |
| Rho has a native Claude MCP connector. | Rho product page | Stretch: wire it in through the Messages API MCP connector instead of our own Rho client. |

## 2. Scope

### Must ship (MVP, done by Wed night)
1. **Connect and sync:** Pull accounts and 6–12 months of transactions from Rho (sandbox) and store them in Supabase.
2. **Categorize:** Claude normalizes vendor names, assigns a category and flags SaaS/recurring spend. Batched, with structured output.
3. **Burn and runway:** Monthly net burn (trailing 3 months), cash balance, runway in months, and a burn trend chart.
4. **Waste finder:** Three detectors, each producing a "finding" with a monthly dollar amount:
   - **Zombie subscriptions:** recurring charges from vendors with no other activity, or tools nobody mentions.
   - **Duplicate tools:** two or more vendors doing the same job (e.g. Zoom + Google Meet, Notion + Confluence).
   - **Price creep:** the same vendor charging more than it did 3 months ago.
5. **Runway Copilot:** A chat agent with tools over the data. It answers "how do I add 3 months of runway?" with a ranked plan, the projected new runway, and drafted actions (cancellation emails, a "lower this card limit in Rho" checklist).
6. **What-if simulator:** Toggle each finding on or off, and the runway number and chart update live. **This is the demo moment.**

### Stretch (Thu morning, only if the MVP is solid)
- **Cheaper-plan finder (Apify):** Scrape the pricing pages of the top 5–10 vendors, and have Claude compare what you pay with the cheapest tier that fits.
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
            │  /api/categorize ──► Claude (structured output, batched)                       │
            │  /api/findings  (SQL detectors + Claude for duplicates)                        │
            │  /api/copilot ──► Claude tool runner ──► tools query Supabase                  │
            └──────────────────────────────┬─────────────────────────────────────────────────┘
                                           ▼
                         Supabase Postgres (+ Auth, + pg_cron for stretch)
                                           ▲
                        Apify actor (stretch): vendor pricing pages ──► pricing table
```

- **Language and stack:** TypeScript, Next.js (App Router), Tailwind + shadcn/ui, Recharts, `@supabase/supabase-js`, and `@anthropic-ai/sdk`. One app, one deploy, so there's no separate backend to babysit.
- **Model:** `claude-opus-5-5` with adaptive thinking. Effort is `low` for bulk categorization and `high` for the Copilot. Server-side refusal fallbacks are on (`fallbacks: "default"`).
- **Secrets:** Kept in `.env.local` and Vercel env vars only. Never committed: `RHO_API_TOKEN`, `RHO_BASE_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`.

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

The agent is a Tool Runner loop (`client.beta.messages.toolRunner`) with typed Zod tools. Claude never does math in its head: every number comes back from a tool.

| Tool | What it does |
|---|---|
| `get_financial_snapshot()` | Returns the balance, trailing-3-month burn, runway and burn by category. |
| `query_transactions({vendor?, category?, from?, to?, min_amount?})` | Returns up to 50 matching transactions. |
| `list_findings({kind?, status?})` | Returns the waste findings with their monthly savings. |
| `simulate_plan({finding_ids[], extra_monthly_cuts_cents?})` | Returns the new burn and new runway. **Pure SQL, deterministic.** |
| `get_vendor_pricing({vendor})` | Returns the scraped pricing tiers (stretch). |
| `draft_action({kind: 'cancel_email' \| 'downgrade_request' \| 'card_limit_checklist' \| 'jira_ticket', vendor, details})` | Writes a draft into `plans.actions`. Nothing is sent automatically. |

The system prompt's core rules are:
- Every claim about money must come from a tool result.
- Reach the target runway with the fewest, lowest-risk cuts first.
- Never suggest cutting payroll or rent unless the user asks.
- End with a numbered plan, the projected runway, and the drafted actions.

## 6. Day-by-day plan

Times are Austin time. For a solo builder, do the rows top to bottom. With 2–3 people, split along **A (data/backend)**, **B (frontend)** and **C (agent/AI)**.

### Mon Oct 26, evening: foundations (~3 hrs)
- [ ] **Submit the Rho API access form** (for the production story; the sandbox doesn't need it).
- [ ] Redeem the Supabase credit, create the project, and run the schema migration from §4.
- [ ] Scaffold Next.js + Tailwind + shadcn and deploy an empty app to Vercel so CI/CD works from hour one.
- [ ] Hit the Rho sandbox with curl and **save sample responses**. Check: How many months of history? How many vendors? Is there SaaS-like spend? Is there a Cards endpoint? This decides whether we need §7's seed data.
- [ ] Check the Notion guide for track names and judging criteria, then adjust §8's pitch to match.

### Tue Oct 27: data and intelligence
- [ ] A: Write the Rho client (paginated `transactions`, `accounts`), build `/api/sync`, and upsert into Supabase.
- [ ] A: Write the demo seed script (§7) so we always have a rich dataset.
- [ ] C: Build `/api/categorize`, which batches 50 transactions per call with structured JSON output. Cache by `counterparty_raw` so each vendor is categorized once.
- [ ] A: Write the burn/runway SQL views, the zombie and price-creep detectors in SQL, and the duplicate-tool detector with Claude (group vendors by job-to-be-done).
- [ ] B: Build the dashboard shell: runway hero number, burn chart, category breakdown and findings list.
- **End of day:** Sync → categorize → findings works end to end on seed data and shows in the UI.

### Wed Oct 28: Copilot and the demo moment
- [ ] C: Implement the Copilot tools from §5, the streaming chat endpoint and the chat UI.
- [ ] B: Build the what-if simulator, where toggling findings updates the runway number and chart live.
- [ ] C: Write about 10 test prompts ("get me to 14 months", "what changed since August?", "why is burn up?") and fix bad answers.
- [ ] Everyone: **Feature freeze at 9 PM.** Do a full demo run-through on the deployed URL.
- **End of day:** The full demo works on the deployed app.

### Thu Oct 29: polish and submit (hard stop at 4:00 PM)
- [ ] Morning: one stretch feature at most. Apify pricing is the recommended pick because it's the most visible.
- [ ] Polish: loading states, empty states, a "Connected to Rho, read-only" trust badge, and a favicon.
- [ ] Record a **2-minute backup demo video**.
- [ ] Write the README (problem, demo GIF, architecture, sponsor tech used) and take screenshots.
- [ ] **Submit by 4:00 PM.** That leaves an hour of buffer before the 5:00 PM close.

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
5. **Trust and tech (30s):** It's read-only Rho, so it can never move money. Supabase for data and auth, Claude for categorization and the agent, deterministic SQL for every number.
6. **Close (15s):** "Every founder at Antler should have this the day they open a bank account."

**Sponsor tech called out on the table sign:** Rho API, Supabase, Apify (if shipped), Atlassian/Jira (if shipped).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox data is too thin | The seeded demo company (§7), built on Tuesday rather than as an afterthought |
| Production Rho access never arrives | The sandbox needs no approval, so the demo doesn't depend on it |
| The LLM invents numbers | Every number comes from SQL via tools. The prompt forbids unsourced figures. |
| Categorization is slow or expensive | Cache by vendor (each unique vendor is categorized once), batch 50 at a time, `low` effort |
| Venue wifi dies on Friday | Phone hotspot, the backup video, and the seed data also available as a local JSON fallback |
| Scope creep | Feature freeze Wed at 9 PM. Stretch features only Thursday morning. |

## 10. Open questions (resolve Monday night)
- [ ] Track names and judging criteria from the Notion guide: does a fintech or "agents" track exist?
- [ ] Is there a Rho-specific prize or challenge?
- [ ] Team: solo, or recruit a frontend person?
- [ ] Does the sandbox expose a Cards endpoint? If so, add card-level findings, e.g. "this card's spend is all SaaS from an inactive cardholder."
