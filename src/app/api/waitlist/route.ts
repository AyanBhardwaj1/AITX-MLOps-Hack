import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { getWaitlist } from "@/lib/server/waitlist";
import { handleSignup } from "@/lib/waitlist/signup";

export const runtime = "nodejs";

const SIGNUPS_PER_MINUTE = 5;
const MAX_BODY_BYTES = 2_048;
const allow = createRateLimiter({ limit: SIGNUPS_PER_MINUTE, windowMs: 60_000 });

/** Early-access signup. Public; cross-site posts are refused by the proxy. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Falls through to validation, which answers with a clear 400.
  }
  try {
    const result = await handleSignup(body, getWaitlist());
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[waitlist] signup failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "We couldn't save that just now. Try again in a minute." }, { status: 500 });
  }
}
