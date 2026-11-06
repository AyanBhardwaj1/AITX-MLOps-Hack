import { NextResponse } from "next/server";
import { z } from "zod";
import { readBodyCapped } from "@/lib/http-body";
import { formatDollars } from "@/lib/money";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/server/company";
import { accessErrorResponse } from "@/lib/server/errors";
import { scopeFor } from "@/lib/server/scope";
import { getStore, persistentStorageReady } from "@/lib/server/store";
import { uploadChunk } from "@/lib/uploads/rows";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000;
const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const body = z.object({ cashCents: uploadChunk.shape.cashCents });

/** Anyone on the team sets today's cash without uploading a file (cash moves daily, exports don't). */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  if (!persistentStorageReady()) return NextResponse.json({ error: "Uploads need DATABASE_URL on this deployment." }, { status: 503 });
  let scope: string;
  try {
    // Who's asking comes first: a signed-out request learns nothing about validation.
    scope = await scopeFor("company");
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    throw err;
  }
  const text = await readBodyCapped(request, MAX_BODY_BYTES).catch(() => null);
  let raw: unknown = null;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    // Falls through to validation.
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Enter today's total cash in dollars." }, { status: 400 });
  try {
    const result = await getStore(scope).setUploadCash(parsed.data.cashCents);
    if (result === "no_uploads") return NextResponse.json({ error: "Upload a bank export first; the cash goes with it." }, { status: 409 });
    await logActivity(scope, "cash", `Set today's cash to ${formatDollars(parsed.data.cashCents)}`);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[uploads] cash update failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }
}
