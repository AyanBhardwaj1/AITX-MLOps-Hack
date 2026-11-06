import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/server/company";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { getStore } from "@/lib/server/store";
import { scopeFor } from "@/lib/server/scope";
import { isStoreError } from "@/lib/store/types";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });
const body = z.object({
  mode: dataModeSchema,
  fingerprint: z.string().min(1).max(200),
  status: z.enum(["open", "accepted", "dismissed"]),
});

/** A person accepts or dismisses a finding. Dismissals survive later detector runs. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = body.safeParse(await readJsonCapped(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const mode = parseMode(parsed.data.mode);
    // Who decided, from the verified session: only on a company's own data (the demo is anonymous).
    const actor = mode === "company" ? ((await sessionUser()) ?? undefined) : undefined;
    await getStore(await scopeFor(mode)).setFindingStatus(parsed.data.fingerprint, parsed.data.status, undefined, actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    if (isStoreError(err)) return NextResponse.json({ error: err.message }, { status: err.code === "not_found" ? 404 : 409 });
    console.error("[findings] status update failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
