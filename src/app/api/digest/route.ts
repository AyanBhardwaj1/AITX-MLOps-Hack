import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { companySlackStatus } from "@/lib/server/company";
import { buildDigestFor, sendCompanyDigestNow, sendDigest } from "@/lib/server/digest-service";
import { accountsEnabled, canSendSlackFromApp, hasSlack } from "@/lib/server/env";

export const runtime = "nodejs";

const allowPreview = createRateLimiter({ limit: 30, windowMs: 60_000 });
const allowSend = createRateLimiter({ limit: 3, windowMs: 60_000 });
const body = z.object({ mode: dataModeSchema });

/** Preview this week's digest (same content Slack would get). */
export async function GET(request: Request) {
  if (!allowPreview(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const mode = parseMode(new URL(request.url).searchParams.get("mode"));
    const digest = await buildDigestFor(mode);
    // A company sends to its own Slack, if it connected one.
    const own = mode === "company" ? (await companySlackStatus()).connected : null;
    return NextResponse.json({ ...digest, slackConfigured: own ?? hasSlack(), canSend: own ?? canSendSlackFromApp() });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[digest] preview failed", err);
    return NextResponse.json({ error: "Couldn't build the digest. Try again." }, { status: 500 });
  }
}

/** Send the digest to Slack now. */
export async function POST(request: Request) {
  if (!allowSend(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const raw = await request.json().catch(() => null);
  // A company's digest goes to its own Slack, never the operator's.
  if (dataModeSchema.safeParse(raw?.mode).data === "company") return sendToCompanySlack();
  if (!hasSlack()) return NextResponse.json({ error: "Slack isn't set up: add SLACK_WEBHOOK_URL on the server." }, { status: 503 });
  // Without a site password anyone could make the app post into the team's Slack.
  if (!canSendSlackFromApp()) {
    const error = accountsEnabled() ? "Sending to Slack from the app isn't available yet." : "Set APP_PASSWORD to send from the app. The Monday digest still goes out on schedule.";
    return NextResponse.json({ error }, { status: 403 });
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await sendDigest(parsed.data.mode);
    return NextResponse.json({ sent: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[digest] send failed", err);
    return NextResponse.json({ error: "Slack didn't accept the digest. Check the webhook URL." }, { status: 502 });
  }
}

async function sendToCompanySlack(): Promise<NextResponse> {
  try {
    const digest = await sendCompanyDigestNow();
    if (!digest) return NextResponse.json({ error: "Connect your company's Slack in settings first." }, { status: 409 });
    return NextResponse.json({ sent: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[digest] company send failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Slack didn't accept the digest. Reconnect it in settings." }, { status: 502 });
  }
}
