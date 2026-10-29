# Submission kit

Due **Thursday Oct 29, 5:00 PM CT** on the hackathon Airtable form. Submitting takes 15–20 minutes, so start by 3:30 PM.

## Form fields

| Field | Value | Status |
|---|---|---|
| Project title | Runway for Rho | ✅ |
| Tracks (max 2) | Rho Fintech + Antler Agents | ✅ |
| Repo link (public) | https://github.com/AyanBhardwaj1/AITX-MLOps-Hack (code is on `main`; set `main` as the default branch in repo Settings → General) | ✅ merged |
| Deployed URL | Vercel: import the repo. No env vars are needed for the demo; DEPLOY.md covers the optional ones | ⬜ deploy |
| Loom video (3–5 min) | Record with the script below | ⬜ record |
| Write-up (150–300 words) | Below | ✅ |
| Team roster | Fill in the README "Team" table (names, roles, contacts) | ⬜ add contact |

README requirements (quick start, stack and architecture, reproducing the demo with a sample `.env`, data provenance, limitations) are all covered in `README.md`.

## Write-up (≈250 words)

> **Problem.** Running out of cash is the most common way startups die, yet most founders can't state their runway to the month. Spend lives in a bank feed nobody reads, and SaaS waste piles up unnoticed: duplicate tools, forgotten subscriptions, quiet price increases.
>
> **Who it helps.** Pre-seed and seed founders who bank with Rho, and the accelerators and fractional CFOs who support them.
>
> **Solution.** Runway connects to Rho's read-only API, so it can never move money. It turns transactions into burn, runway and a forecast range. It also finds four kinds of waste: overlapping tools, price increases, subscriptions still billing a departed teammate's card, and double charges. Every finding carries a dollar amount and the transactions behind it. A Copilot agent answers "get me to 14 months without touching payroll" by planning with tools over the same deterministic math. An Autopilot agent runs the monthly review end to end: sync, analyze, price fixes in runway, write a memo, and file a ticket per finding. The memo is rejected if it contains any number the math didn't produce, and agents can only ever create drafts.
>
> **Impact.** On our seeded demo company, Runway found:
> - $2,570/month of waste (+0.4 months of runway) and a $119.99 refund.
> - An annual renewal to decide on before it hits.
> - AI spend growing 7.3% a month.
>
> It showed runway falling from 12.2 to 11.0 months if revenue drops 30%, and analyzed about 970 transactions in under 10 ms. Our eval scores 100% precision and recall on planted waste across 10 seeded companies. A founder could connect it today and act on it tomorrow.

## Loom script (about 4 minutes)

1. **Hook (0:00–0:20).** "Most startups die because they run out of money, and most founders can't tell you their runway to the month. Runway reads your Rho account and tells you, then finds the money you're wasting."
2. **Dashboard (0:20–1:00).**
   - Runway is 12.2 months, with a likely range of 12.0–12.5 and 11.0 months if revenue falls 30%.
   - Open the cash forecast: the P10–P90 band comes from 1,000 simulations of the company's own month-to-month swings.
   - Note the "Read-only" badge: it can never move money.
3. **Waste (1:00–2:00).**
   - Walk through the findings: Salesforce + HubSpot, Datadog up 50%, and three tools still billing Priya's card 156 days after her last purchase.
   - Click "Show transactions" for the evidence.
   - Tick findings and watch runway and the "if you act" line move.
4. **Coming up and AI spend (2:00–2:30).** Carta's $2,800 annual renewal is in 20 days, flagged "Decide". AI spend is up 7.3% a month.
5. **Autopilot and the Inbox (2:30–3:20).**
   - Click Run now. Walk the step log: sync, analyze, plan, memo, tasks.
   - Read the memo, including the "Decide before it renews" section.
   - Open the **Inbox**: one ticket draft per finding.
   - Approve one (with Jira configured it's filed there) and reject one.
   - Mention that it also runs every morning on a schedule, and that dismissed findings stay dismissed.
6. **Copilot (3:20–3:50, if `OPENAI_API_KEY` is set).** Ask "Get me to 14 months without touching payroll". It calls `plan_to_target` and says honestly how much more needs cutting.
7. **Not a wrapper (3:50–4:20).**
   - Show `npm run eval`: 100% precision and recall, with negative controls.
   - Mention 146 tests (plus Postgres integration tests), tenant-ready Supabase schema with RLS, and the memo number check.
   - Close: "Every founder at Antler should have this the day they open a bank account."

If Copilot isn't live, skip step 6 and spend the time on Autopilot. Everything else works with no keys.

## X post (2 free Community Choice votes)

> Built Runway for Rho at #AustinTechWeek: it reads your Rho bank feed, finds wasted SaaS spend, and turns it into months of runway, with an agent that files the tickets. 100% precision on our waste eval, and no LLM in the math. @AITXCommunity @MLOpsWorld

## Friday Hack Fair

Arrive at 12:00 PM. Bring a laptop, a charger, a phone hotspot and the Loom saved offline. Run `npm run build && npm start` locally as a backup in case the venue wifi fails; the demo company needs no network.
