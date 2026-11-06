import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/access";
import { executeAutopilot, runCompanyAutopilots } from "@/lib/server/autopilot-service";
import { accountsEnabled, env } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;
/**
 * No new company starts after this; the rest leaves room under maxDuration for one more company's
 * budget check and review (vendor labels and an AI memo can take several seconds each) and the response.
 */
const COMPANY_BUDGET_MS = 30_000;

/**
 * Daily Autopilot run, triggered by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without a configured secret this route refuses everything.
 */
export async function GET(request: Request) {
  const e = env();
  if (!checkBearer(request.headers.get("authorization"), e.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  // The env Rho feed is off once accounts are on; the companies' own data is reviewed below instead.
  const skipShared = accountsEnabled() && e.AUTOPILOT_CRON_MODE === "sandbox";
  const run = skipShared ? null : await executeAutopilot(e.AUTOPILOT_CRON_MODE, "cron");
  const companies = accountsEnabled() ? await runCompanyAutopilots({ budgetMs: COMPANY_BUDGET_MS - (Date.now() - startedAt) }) : null;
  return NextResponse.json(
    {
      ...(run ? { status: run.status, runId: run.id, findings: run.findingsCount, drafted: run.tickets.length, persisted: run.persisted } : { skipped: "AUTOPILOT_CRON_MODE=sandbox is off when accounts are on" }),
      // Counts only: which companies ran stays in the server logs.
      ...(companies ? { companies: { ran: companies.ran.length, failed: companies.failed.length, skipped: companies.skipped, budgetAlerts: companies.budgetAlerts } } : {}),
    },
    { status: run?.status === "failed" ? 502 : 200 },
  );
}
