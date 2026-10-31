# Runway for Rho

**Finds the wasted spend in a startup's Rho account and turns it into months of runway.**

[![CI](https://github.com/AyanBhardwaj1/AITX-MLOps-Hack/actions/workflows/ci.yml/badge.svg)](https://github.com/AyanBhardwaj1/AITX-MLOps-Hack/actions/workflows/ci.yml) [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAyanBhardwaj1%2FAITX-MLOps-Hack&project-name=runway-for-rho)

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
- **Copilot** (chat agent): "Get me to 14 months without touching payroll." It plans with tools over the same math and drafts cancellation emails, downgrade requests and Jira tickets. Drafts are never sent automatically. With no OpenAI key, its suggested questions are still answered instantly by the same tools through a fixed template, labelled as not AI-written.
- **Autopilot** (autonomous agent): one click, or a schedule, runs the monthly review end to end: pull from Rho → analyze → price each fix in runway → write the Runway Review memo → file a task per finding. Every step is logged with timings.
- **Inbox: a person approves every action.** Copilot and Autopilot drafts (vendor cancellation emails, downgrade requests, card-limit checklists, tickets) wait in an Inbox. Approving a ticket files it in Jira, and approved emails are ready to copy and send.
- **Decisions that stick.**
  - Mark a finding "Act on this" or **Dismiss** it.
  - Dismissals survive later detector runs, and Autopilot skips dismissed findings.
  - Every decision lands in an append-only audit log.
- **Runs on its own.**
  - Autopilot also runs daily via Vercel Cron.
  - Each run's steps and memo are kept as history.
- **This week + Monday digest.** Deterministic alerts for spend spikes, large one-off payments, subscription price changes, new vendors, renewals due within 14 days and low runway. The same list, plus runway, the default-alive verdict and open waste, goes to Slack every Monday (incoming webhook).
- **Plan ahead: default alive?** Paul Graham's test, computed: revenue growth is estimated from six months of the feed, and the planner projects month by month with hires, a raise, cut waste or a different growth rate. It shows break-even, the cash-out date and the minimum growth that keeps you alive.
- **Verified savings.** After you act on a finding, Runway watches the next bills: a cancelled tool must stop charging, a price increase must drop back, a double charge needs its refund. Only verified money counts as saved, and anything still charging is flagged.
- **Free CSV Runway Grader** (`/grader`, no signup). Drop a Rho, Mercury or generic bank export and type today's cash. You get runway, a range from past swings and the top wasted spend. It runs in your browser: a Playwright check logged zero network requests during grading. It also states plainly what a given upload can't see, such as card waste in a checking-only export.
- **Inbox ordered by what's at stake.** Drafts waiting for approval are sorted by the dollar impact of their finding, so the few approvals you make each week are the ones that matter.
- **Investor update.** This month's update drafted from the bank feed: revenue and month-over-month change, burn, cash, runway, default alive, software spend moves and verified cuts. Wins, misses and asks stay marked for you to write.
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
| `npm run test:db` | Applies the Supabase migrations to a throwaway local Postgres and checks tenant isolation, draft-only actions and the audit trail |
| `npm run test:integration` | Runs the same persistence contract the unit tests use, against real Postgres (throwaway database) |
| `npm run db:migrate` | Applies `supabase/migrations` to `DATABASE_URL`, once each (safe to re-run) |
| `npm run verify:live` | Checks every configured integration (Rho, OpenAI, database, Jira) against the real services: PASS / FAIL / SKIP |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

## Reproducing the demo

1. `npm install && npm run dev`, then open http://localhost:3000. The demo company loads by default.
2. Tick findings in **Waste found** to see the runway change, and click **Show N transactions** for the evidence.
3. Open **Autopilot** → **Run now** to get the step log, the Runway Review memo and the task list.
4. Open **Copilot** and click "Get me to 14 months of runway without touching payroll". Without `OPENAI_API_KEY` you get the instant (template) answer; with it, the agent plans live and you can ask anything.

Every credential is optional, and each one switches on one more piece: GPT features, permanent storage, a password, your real Rho account, the daily schedule, Jira. **[DEPLOY.md](DEPLOY.md)** lists where each value comes from and the exact setup steps. `.env.example` has the full list.

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

## Production readiness

- **CI on every push** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
  - typecheck, lint, 150 unit tests and a production build;
  - the detector eval, which fails the build below 95% precision or recall;
  - `npm audit`;
  - schema tests and the Postgres store contract against a real Postgres service.
- **Security headers:** strict Content-Security-Policy (no third-party scripts or connections), HSTS, `X-Frame-Options: DENY`, `nosniff`, a tight referrer and permissions policy, and no `X-Powered-By`.
- **Health check:** `GET /api/health` reports whether the database is reachable (and the deployed commit). It never returns configuration values and sits outside the password gate so uptime monitors can reach it.
- **Accessibility:** zero axe-core violations (WCAG 2.1 AA rules plus best practices) across all three agent tabs. The agent tabs are a keyboard-navigable ARIA tablist.
- **Failure handling:** if the Rho feed or the database is down, the dashboard falls back to the demo company or in-memory decisions and says so. Friendly error, not-found and loading pages, plus link-preview cards for sharing.

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
- **Speed:** full analysis of ~950 transactions in about 7–10 ms. The forecast's 1,000 simulations add about 10 ms.

Each company also contains negative controls that must not be flagged: usage-based AWS/OpenAI growth, Slack + Zoom + Loom, AWS + Vercel, varying airfare, and irregular one-offs (laptops, legal bills).

**Honest caveat:** the detectors were developed against this generator. These numbers show the logic works on known patterns, not accuracy on real ledgers.

### Stress test on ledger shapes the detectors weren't tuned for

`npm run stress-eval` re-scores the detectors on the same 20 seeds × 2 noise levels after transforming the ledger in ways real feeds differ from the generator:
- business-day posting
- vendor renames
- refunds
- a shared founder card
- per-person seat cards
- annual and usage-priced billing
- second workspaces billed the same day
- refunded double charges
- 12-month histories

The first run exposed three real defects: steady usage growth read as a price increase (43% precision), recurring second workspaces read as double charges (4%), and refunded double charges kept being flagged. To avoid grading our own homework, a separate agent wrote a **held-out** set of 15 variants without seeing the detector code (`src/lib/eval/heldout.ts`). It was frozen and run on the unfixed code, where precision on the affected detectors was 0–50%. The fixes were developed on the dev settings only. In the first committed after-fixes run of the held-out set, every detector scored 100% precision and recall wherever something was planted or found. In the three full-refund variants nothing was planted and nothing was found, which is correct.

Remaining stated limits:
- Billing names the alias table doesn't know are found under the unfamiliar name.
- With ±4-day posting jitter, recall drops to 88–98%.
- All of this is one generated company shape (`synthetic_proxy`), not real ledgers.

Details and every number's source: `sleep-research/` (tracker, runs, reviews).

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

- **There's one shared password, not per-user accounts.**
  - With `APP_PASSWORD` set, every page and API needs it.
  - The app **refuses to show a real Rho account unless `APP_PASSWORD` is set**.
  - Multi-company use still needs Supabase Auth, per-org Rho tokens from Vault and an org-keyed cache. The schema already has `org_id` and RLS on every table.
- **Basic abuse protection is in place:**
  - Agent routes are rate-limited per IP, but per server instance; production needs a shared store.
  - Copilot accepts only user/assistant text, capped in size, so clients can't inject system prompts or forge tool results.
  - Output tokens are capped.
  - Also set a monthly spend limit on the OpenAI project.
- **Jira filing checks for an existing issue first**, by the finding's label via `POST /rest/api/3/search/jql`, and fails closed if that check errors. The endpoint name changed in 2025, so verify it against your Atlassian site.
- **Without `DATABASE_URL`, decisions live in the server's memory.** On serverless hosts that memory can reset at any time. Set `DATABASE_URL` for permanent storage.
- **The LLM paths are built but haven't been run against the live OpenAI API** (no key in the build environment):
  - Copilot
  - the memo writer
  - the vendor fallback

  Their deterministic parts (tools, validation, the memo number check) are tested. Without a key, everything degrades to rules and templates.
- **Zombie detection is a heuristic.** Bank data has no usage data, so "idle card" stands in for "unused". SSO or Google Workspace signals would make it precise.
- **The forecast range covers past month-to-month swings, not trends or shocks, and is too narrow.** A backtest on generated history (`npx tsx scripts/runway-backtest.ts`) found:
  - Realized cash landed inside the P10–P90 band only 59% / 41% of the time at 3 / 6 months.
  - After a hiring ramp, a revenue drop or a big one-off bill, reality fell *below* P10 in 56–100% of cases at 6 months.
  - The UI and Copilot therefore call it a "range from past swings". Use the scenario planner and the revenue-drop line for trends.
  - A trend-aware range is the top next step.
- **SaaS waste is one lever, not the biggest.** On the demo cohort, fixing all detected waste adds about 0.4 months of runway, while delaying one $15k/month hire by 3 months adds about 0.56 (`scripts/runway-levers.ts`; one company shape, illustrative).
- **Not built yet** (ranked in [the product research](reports/Runway%20product%20go%20to%20market.md)):
  - Rho partner OAuth (needs Rho's partner approval) and a Mercury connector.
  - Inbox ranking and batching by dollar impact; categorization corrections that stick.
  - Stripe MRR for the revenue side of the default-alive test.
  - Email delivery for the digest; a multi-client view for fractional CFOs.
- **The Rho field mapping is unverified.** It was built from Rho's public docs and earlier hackathon clients, and needs re-checking against the live sandbox and production API.

## Team

| Name | Role | Contact |
|---|---|---|
| Ayan Bhardwaj | Builder | _add contact_ |
