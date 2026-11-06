import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { isOperator } from "@/lib/server/operator";
import { getWaitlist } from "@/lib/server/waitlist";
import { waitlistInput } from "@/lib/waitlist/types";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });
const body = waitlistInput.pick({ email: true });

/** An operator lets one email create an account: waiting on the list, or added to it now. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  // Anyone else gets the same answer as a page that doesn't exist.
  if (!(await isOperator())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
  const waitlist = getWaitlist();
  if (!waitlist) return NextResponse.json({ error: "The waitlist needs DATABASE_URL on this deployment." }, { status: 503 });
  try {
    const { email } = parsed.data;
    await waitlist.add({ email, role: null, bank: null, source: "operator" });
    await waitlist.invite(email);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin] invite failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t invite that email. Try again." }, { status: 500 });
  }
}
