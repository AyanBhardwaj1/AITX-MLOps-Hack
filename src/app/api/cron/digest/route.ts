import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/access";
import { sendCompanyDigests, sendDigest } from "@/lib/server/digest-service";
import { accountsEnabled, env, hasSlack } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;
/** No new company digest starts after this, leaving room under maxDuration. */
const COMPANY_BUDGET_MS = 40_000;

/** Monday digest to Slack, triggered by Vercel Cron (see vercel.json). Same bearer secret as the Autopilot cron. */
export async function GET(request: Request) {
  const e = env();
  if (!checkBearer(request.headers.get("authorization"), e.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  // The operator's own digest (demo or the env feed) to the operator's Slack, when configured.
  let operator: Record<string, unknown> = { skipped: "SLACK_WEBHOOK_URL not set" };
  if (accountsEnabled() && e.AUTOPILOT_CRON_MODE === "sandbox") operator = { skipped: "AUTOPILOT_CRON_MODE=sandbox is off when accounts are on" };
  else if (hasSlack()) {
    try {
      const digest = await sendDigest(e.AUTOPILOT_CRON_MODE);
      operator = { sent: true, changes: digest.changes.length };
    } catch (err) {
      console.error("[cron/digest] failed", err);
      operator = { error: "Digest failed" };
    }
  }
  // Every company that connected its own Slack gets its own digest. Counts only in the response.
  const companies = accountsEnabled() ? await sendCompanyDigests({ budgetMs: COMPANY_BUDGET_MS - (Date.now() - startedAt) }) : null;
  return NextResponse.json({ ...operator, ...(companies ? { companies } : {}) }, { status: "error" in operator ? 502 : 200 });
}
