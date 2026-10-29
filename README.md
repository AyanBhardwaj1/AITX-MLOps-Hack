# Runway for Rho

**Finds the wasted spend in a startup's Rho account and turns it into months of runway.**

Built at the AITX & MLOps World Community Hackathon (Austin Tech Week, Oct 26–29, 2026). Tracks: 💳 Rho Fintech and 🤖 Antler Agents.

![Runway dashboard](docs/screenshot.png)

## What it does

- **Burn and runway you can trust.** Cash, gross and net burn, runway and zero-cash date come from deterministic, tested TypeScript. The LLM never does the math.
- **Waste detection from bank data alone.** No integrations or receipts needed:
  - **Overlapping tools:** e.g. Zoom + Webex, or Salesforce + HubSpot doing the same job.
  - **Price increases:** e.g. Datadog quietly up 50%.
  - **Subscriptions still billing an idle card:** e.g. a departed teammate's card paying for Figma, Miro and Calendly.
  - **Double charges.**
- **Live what-if.** Tick findings and watch runway and the zero-cash date move.
- **Cash forecast with a range, not a guess.**
  - A 1,000-path bootstrap Monte Carlo replays the company's own month-to-month swings, giving a P10–P90 runway range and zero-cash dates.
  - It sits alongside an "if you act" line that follows your what-if selection.
  - A stress line shows what happens if revenue falls 30%.
- **Renewals calendar.** Every subscription charge due in the next 60 days, with annual, quarterly or $5k+ renewals flagged as decisions to make *before* they renew.
- **AI & LLM spend tracker.** Monthly API spend, compound growth rate, share of spend and a 12-month projection: the fastest-growing line item at AI startups.
- **Copilot** (chat agent): "Get me to 14 months without touching payroll." It plans with tools over the same math and drafts cancellation emails, downgrade requests and Jira tickets. Drafts are never sent automatically.
- **Autopilot** (autonomous agent): one click, or a schedule, runs the monthly review end to end: pull from Rho → analyze → price each fix in runway → write the Runway Review memo → file a task per finding. Every step is logged with timings.
- **Read-only by design.** Rho's API can't move money, and neither can Runway. Agents can only create drafts; the database refuses anything else.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add OPENAI_API_KEY for Copilot and LLM memos
npm run dev                  # http://localhost:3000
```

The dashboard, what-if, detectors and Autopilot all work with **no keys at all** on the seeded demo company. Switch to **Rho sandbox** in the header to pull the live sandbox feed (`https://rhoapi-sandbox.rho.co/api/v1`, which accepts any token).

| Command | What it does |
|---|---|
| `npm test` | Unit tests (vitest) |
| `npm run eval` | Scores the detectors against planted waste across 5 seeds × 2 noise levels (`-- --write` updates `docs/eval-results.md`) |
| `npm run test:db` | Applies the Supabase migration to a throwaway local Postgres and checks tenant isolation, draft-only actions and the audit trail |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

## Reproducing the demo

1. `npm install && npm run dev`, then open http://localhost:3000. The demo company loads by default.
2. Tick findings in **Waste found** to see the runway change, and click **Show N transactions** for the evidence.
3. Open **Autopilot** → **Run now** to get the step log, the Runway Review memo and the task list.
4. With `OPENAI_API_KEY` set, open **Copilot** and click "Get me to 14 months of runway without touching payroll".

Environment variables (see `.env.example`):

| Variable | Needed for | Default |
|---|---|---|
| `OPENAI_API_KEY` | Copilot chat, LLM-written memo, labelling unknown vendors | unset: Copilot disabled, template memo, rules-only vendors |
| `OPENAI_MODEL_AGENT` / `OPENAI_MODEL_FAST` | Model choice | `gpt-6.1-sol` / `gpt-6-luna` |
| `RHO_BASE_URL` / `RHO_API_TOKEN` | Rho feed | sandbox URL / `sandbox` |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Filing real Jira tickets from Autopilot | unset: tickets stay as drafts |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Persistence (schema in `supabase/migrations`) | not yet wired; see limitations |

## Stack and architecture

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Recharts · Vercel AI SDK 7 with OpenAI GPT-6 · Supabase Postgres · zod · vitest

```
Rho API (read-only) ──► rho/client.ts ──► rho/map.ts ──► pipeline.ts ──────────────► Dashboard (what-if runs in the browser)
  or seeded demo          paginate, retry,   key (account,id),  ├ vendors/normalize   rules-first vendor matching
  company (Rho format)    validate (zod)     drop failed rows,  ├ finance/runway      burn, runway, goal-seek
                                             transfers ≠ burn   └ detect/*            recurring streams + 4 detectors
                                                                       │
                                     ┌─────────────────────────────────┴───────────────────────────┐
                                     ▼                                                             ▼
                      Copilot (AI SDK ToolLoopAgent)                         Autopilot (fixed pipeline)
                      tools = agent/tools.ts (zod-validated,                 sync → analyze → plan → memo → file_tasks
                      pure functions; no raw SQL)                            LLM memo rejected unless every $ / month
                                                                             figure matches the analysis; Jira via ADF
```

Design choices worth knowing:

- **Rules before models.**
  - A vendor catalog with alias matching resolves about 97% of vendors on the demo data with zero LLM calls (see eval).
  - Only the unknown remainder goes to the cheap model (`gpt-6-luna`), once per vendor and cached.
  - The model's output is forced into the same closed category and job lists, and gated on confidence.
  - If the model fails, the app falls back to rules only.
- **Plan-then-execute Autopilot.** The step sequence is fixed before any (untrusted) bank text is read, so a hostile transaction description can't change what actions run.
- **Tenant-ready schema** (`supabase/migrations`):
  - `org_id` and RLS on every table; members can only read.
  - Fingerprinted findings and actions, so a re-run never revives a dismissed item or files a duplicate ticket.
  - A trigger rejects any agent-created action that isn't a draft.
  - Status changes go through RPCs that write an append-only audit log.
  - Agent runs and steps are logged in OpenTelemetry GenAI shape with integer costs.

## Evaluation

`npm run eval` (latest run, also in [docs/eval-results.md](docs/eval-results.md)):

| Detector | Precision | Recall |
|---|---|---|
| Overlapping tools | 100% | 100% |
| Price increase | 100% | 100% |
| Idle-card subscriptions | 100% | 100% |
| Double charge | 100% | 100% |

- **Dollar-weighted recall:** 100%.
- **Rules-only vendor categorization:** 97.1%. The one miss is an unknown coffee shop, which the LLM fallback handles.
- **Speed:** full analysis of ~970 transactions in about 7–10 ms. The forecast's 1,000 simulations add about 10 ms.

Each company also contains negative controls that must not be flagged: usage-based AWS/OpenAI growth, Slack + Zoom + Loom, AWS + Vercel, varying airfare, and irregular one-offs (laptops, legal bills).

**Honest caveat:** the detectors were developed against this generator. These numbers show the logic works on known patterns, not accuracy on real ledgers.

The eval and two independent code reviews caught real bugs during development, each now covered by a regression test:
- Two people's identical orders were flagged as a double charge.
- Airfare was flagged as price creep.
- Savings were double-counted when one tool appeared in two findings.
- A departed teammate was blamed for a tool someone else now pays for.

## Data and provenance

- **Taco Robotics, Inc.** is a **synthetic** company generated by `src/lib/seed/demo-company.ts`:
  - Deterministic and seeded, covering 24 months.
  - Includes realistic revenue swings and irregular one-off purchases.
  - Every row is fake, in Rho's exact wire format, with planted waste recorded as ground truth.
  - The UI labels it as demo data.
- **Rho sandbox** is Rho's own fictional, static feed. It has 72 transactions ending June 2026 and almost no SaaS spend, so Runway dates its analysis by the latest transaction when using it.
- **Prior art** (studied, not copied): see [docs/prior-art.md](docs/prior-art.md) for what earlier Rho hackathon projects taught us about the API.

## Known limitations and next steps

- **No user authentication yet.** The app serves one demo tenant, so **don't point `RHO_API_TOKEN` at a real account on a public deploy**. Before real customer data it needs:
  - Supabase Auth
  - per-org Rho tokens from Vault
  - an org-keyed cache
- **Basic abuse protection is in place:**
  - Agent routes are rate-limited per IP, but per server instance; production needs a shared store.
  - Copilot accepts only user/assistant text, capped in size, so clients can't inject system prompts or forge tool results.
  - Output tokens are capped.
  - Also set a monthly spend limit on the OpenAI project.
- **Jira filing checks for an existing issue first**, by the finding's label via `POST /rest/api/3/search/jql`, and fails closed if that check errors. The endpoint name changed in 2025, so verify it against your Atlassian site.
- **Supabase persistence is designed and tested** (migration plus `npm run test:db`) but not yet wired into the app. Analysis currently runs in memory per request.
- **The LLM paths are built but haven't been run against the live OpenAI API** (no key in the build environment):
  - Copilot
  - the memo writer
  - the vendor fallback

  Their deterministic parts (tools, validation, the memo number check) are tested. Without a key, everything degrades to rules and templates.
- **Zombie detection is a heuristic.** Bank data has no usage data, so "idle card" stands in for "unused". SSO or Google Workspace signals would make it precise.
- **The Monte Carlo band captures month-to-month noise, not trends.** For a steady company the band is narrow, so the revenue-drop stress line is the more useful risk view.
- **Not built yet:**
  - Apify-scraped plan pricing for "cheaper tier" suggestions.
  - Treasury idle-cash insight.
  - Slack digest.
  - Closing the loop by checking that the next Rho charge actually dropped.
- **The Rho field mapping is unverified.** It was built from Rho's public docs and earlier hackathon clients, and needs re-checking against the live sandbox and production API.

## Team

| Name | Role | Contact |
|---|---|---|
| Ayan Bhardwaj | Builder | _add contact_ |
