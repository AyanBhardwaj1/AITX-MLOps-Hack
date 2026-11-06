import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/access";
import { executeAutopilot } from "@/lib/server/autopilot-service";
import { accountsEnabled, env } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily Autopilot run, triggered by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without a configured secret this route refuses everything.
 */
export async function GET(request: Request) {
  const e = env();
  if (!checkBearer(request.headers.get("authorization"), e.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The env Rho feed is off once accounts are on; per-company schedules aren't built yet.
  if (accountsEnabled() && e.AUTOPILOT_CRON_MODE === "sandbox") return NextResponse.json({ skipped: "AUTOPILOT_CRON_MODE=sandbox is off when accounts are on" });
  const run = await executeAutopilot(e.AUTOPILOT_CRON_MODE, "cron");
  return NextResponse.json(
    { status: run.status, runId: run.id, findings: run.findingsCount, drafted: run.tickets.length, persisted: run.persisted },
    { status: run.status === "failed" ? 502 : 200 },
  );
}
