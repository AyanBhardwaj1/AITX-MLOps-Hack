import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { createSharedRateLimiter } from "@/lib/server/shared-rate-limit";
import { getWaitlist } from "@/lib/server/waitlist";
import { handleSignup } from "@/lib/waitlist/signup";
import { readBodyCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const SIGNUPS_PER_MINUTE = 5;
const MAX_BODY_BYTES = 2_048;
const allow = createSharedRateLimiter({ name: "waitlist-ip", limit: SIGNUPS_PER_MINUTE, windowMs: 60_000 });
const noStore = { "Cache-Control": "no-store" };

/** Early-access signup. Public; cross-site posts are refused by the proxy. */
export async function POST(request: Request) {
  if (!(await allow(clientIp(request)))) return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  // Counted as it arrives, so a chunked body with no length can't be buffered without limit.
  const text = await readBodyCapped(request, MAX_BODY_BYTES).catch(() => "");
  if (text === null) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  const store = getWaitlist();
  if (!store) {
    console.error("[waitlist] no DATABASE_URL on a hosted deployment: refusing signups so none are lost");
    return NextResponse.json({ error: "Signups are paused for a moment. Please try again later." }, { status: 503, headers: noStore });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Falls through to validation, which answers with a clear 400.
  }
  try {
    const result = await handleSignup(body, store);
    return NextResponse.json(result.body, { status: result.status, headers: noStore });
  } catch (err) {
    console.error("[waitlist] signup failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "We couldn't save that just now. Try again in a minute." }, { status: 500, headers: noStore });
  }
}
