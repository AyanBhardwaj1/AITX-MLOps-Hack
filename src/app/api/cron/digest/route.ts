import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/access";
import { sendDigest } from "@/lib/server/digest-service";
import { accountsEnabled, env, hasSlack } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Monday digest to Slack, triggered by Vercel Cron (see vercel.json). Same bearer secret as the Autopilot cron. */
export async function GET(request: Request) {
  const e = env();
  if (!checkBearer(request.headers.get("authorization"), e.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The env Rho feed is off once accounts are on; per-company schedules aren't built yet.
  if (accountsEnabled() && e.AUTOPILOT_CRON_MODE === "sandbox") return NextResponse.json({ skipped: "AUTOPILOT_CRON_MODE=sandbox is off when accounts are on" });
  if (!hasSlack()) return NextResponse.json({ skipped: "SLACK_WEBHOOK_URL not set" });
  try {
    const digest = await sendDigest(e.AUTOPILOT_CRON_MODE);
    return NextResponse.json({ sent: true, changes: digest.changes.length });
  } catch (err) {
    console.error("[cron/digest] failed", err);
    return NextResponse.json({ error: "Digest failed" }, { status: 502 });
  }
}
