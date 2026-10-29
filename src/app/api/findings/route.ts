import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { getStore } from "@/lib/server/store";
import { scopeFor } from "@/lib/server/scope";
import { StoreError } from "@/lib/store/types";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });
const body = z.object({
  mode: z.enum(["demo", "sandbox"]).default("demo"),
  fingerprint: z.string().min(1).max(200),
  status: z.enum(["open", "accepted", "dismissed"]),
});

/** A person accepts or dismisses a finding. Dismissals survive later detector runs. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await getStore(scopeFor(parseMode(parsed.data.mode))).setFindingStatus(parsed.data.fingerprint, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: err.code === "not_found" ? 404 : 409 });
    console.error("[findings] status update failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
