import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { buildDigestFor, sendDigest } from "@/lib/server/digest-service";
import { canSendSlackFromApp, hasSlack } from "@/lib/server/env";

export const runtime = "nodejs";

const allowPreview = createRateLimiter({ limit: 30, windowMs: 60_000 });
const allowSend = createRateLimiter({ limit: 3, windowMs: 60_000 });
const body = z.object({ mode: z.enum(["demo", "sandbox"]).default("demo") });

/** Preview this week's digest (same content Slack would get). */
export async function GET(request: Request) {
  if (!allowPreview(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const digest = await buildDigestFor(parseMode(new URL(request.url).searchParams.get("mode")));
    return NextResponse.json({ ...digest, slackConfigured: hasSlack(), canSend: canSendSlackFromApp() });
  } catch (err) {
    console.error("[digest] preview failed", err);
    return NextResponse.json({ error: "Couldn't build the digest. Try again." }, { status: 500 });
  }
}

/** Send the digest to Slack now. */
export async function POST(request: Request) {
  if (!allowSend(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  if (!hasSlack()) return NextResponse.json({ error: "Slack isn't set up: add SLACK_WEBHOOK_URL on the server." }, { status: 503 });
  // Without a site password anyone could make the app post into the team's Slack.
  if (!canSendSlackFromApp()) return NextResponse.json({ error: "Set APP_PASSWORD to send from the app. The Monday digest still goes out on schedule." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await sendDigest(parsed.data.mode);
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[digest] send failed", err);
    return NextResponse.json({ error: "Slack didn't accept the digest. Check the webhook URL." }, { status: 502 });
  }
}
