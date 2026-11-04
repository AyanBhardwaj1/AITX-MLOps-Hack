import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { handleCorrection } from "@/lib/vendors/correction-request";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Set or clear a person's category fix for one vendor. Behind APP_PASSWORD when set; cross-site writes are refused by the proxy. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many changes. Wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null);
  try {
    const result = await handleCorrection(body, (mode) => getStore(scopeFor(mode)));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[corrections] save failed", err);
    return NextResponse.json({ error: "Couldn't save that change. Try again." }, { status: 500 });
  }
}
