import { NextResponse } from "next/server";
import { readBodyCapped } from "@/lib/http-body";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { accessErrorResponse } from "@/lib/server/errors";
import { scopeFor } from "@/lib/server/scope";
import { getStore, persistentStorageReady } from "@/lib/server/store";
import { MAX_ROWS_PER_COMPANY, uploadChunk } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

export const runtime = "nodejs";

/** Below Vercel's 4.5 MB request limit; a 5,000-row chunk is well under it. */
const MAX_BODY_BYTES = 4_000_000;
const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** Adds one chunk of the signed-in company's parsed bank exports. Contents are never logged. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many uploads at once. Wait a minute." }, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "Too much in one go." }, { status: 413 });
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
  const text = await readBodyCapped(request, MAX_BODY_BYTES).catch(() => "");
  if (text === null) return NextResponse.json({ error: "Too much in one go." }, { status: 413 });
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    // Falls through to validation.
  }
  const parsed = uploadChunk.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Some rows couldn’t be read. Check the file and try again." }, { status: 400 });
  try {
    const store = getStore(scope);
    const result = await store.saveUploads(parsed.data.cashCents, storedRowsFrom(parsed.data.rows), MAX_ROWS_PER_COMPANY);
    if (result === "limit") return NextResponse.json({ error: `A company can store up to ${MAX_ROWS_PER_COMPANY.toLocaleString("en-US")} transactions.` }, { status: 409 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[uploads] save failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t save that upload. Try again." }, { status: 500 });
  }
}
