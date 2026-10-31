# Plan: post-hackathon features (retention and planning)

Source: `reports/Runway product go to market.md` and `research_notes/Runway product go to market/retention_features.md`.
The research ranks a weekly digest with alerts first (retention), then planning and investor updates (monthly rituals).

**Assumptions (user away; proceeding):** demo data stays the default; Slack is the first delivery channel (incoming webhook, no OAuth app);
email comes later. All numbers stay deterministic; no LLM in any new math.

## Requirements / acceptance criteria

1. **Scenario planner + default alive** (`src/lib/finance/scenario.ts`)
   - Revenue growth is estimated from the last 6 complete months of inflows by log-linear least squares, clamped to [-20%, +30%]/mo; 0 when any month has no inflow.
   - Projection month by month (max 60): revenue grows at g, expenses grow at e (default 0), plus hires from their start month, minus monthly cuts, plus a one-off raise.
   - Output: monthly points, run-out month (fractional) or null, break-even month or null, `defaultAlive` = break-even reached before cash runs out, and the minimum growth that would make the company default alive (binary search, null if > 30%).
   - Same inputs → identical output; a raise or cuts never shorten runway; adding hires never lengthens it.
2. **What changed** (`src/lib/insights/changes.ts`): burn spike (last month outflow > 25% and > $5k over the prior 3-month average), new vendor (first ever charge in last 30 days, ≥ $100), price change on a recurring stream (latest charge ≥ 10% above the previous, within 35 days), large one-off (≥ $10k outflow in last 14 days, not part of a recurring stream), runway below 12 / 6 months, and decide-renewals within 14 days. Sorted critical → warn → info, then by amount.
3. **Weekly digest** (`src/lib/insights/digest.ts` + `src/lib/server/slack.ts` + `/api/digest` + `/api/cron/digest`): deterministic Markdown and Slack mrkdwn; Slack webhook must be `https://hooks.slack.com/services/...` (host allowlist, fail closed); cron secured by CRON_SECRET like the Autopilot cron; preview in the UI.
4. **Investor update** (`src/lib/insights/investor-update.ts`): monthly update from real numbers (cash, burn, runway, revenue and MoM growth, default-alive verdict, spend changes, savings acted on) with clearly marked founder sections; editable and copyable in the UI.
5. Copilot tools + instant answers for scenario ("Are we default alive?") and changes ("What changed this week?").

## NOT building now
Email delivery, Mercury/Plaid connectors, Stripe MRR, multi-client view, verified-savings loop (needs post-acceptance data; next).

## Testing
Unit tests per module (happy path, empty data, zero revenue, infinite runway, boundaries, invalid input), API input validation, browser E2E for the new UI, axe, eval unchanged.
