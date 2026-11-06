import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { snapshotFor } from "@/lib/server/share";
import { getStore, persistentStorageReady } from "@/lib/server/store";
import { canWriteRealData } from "@/lib/server/write-guard";
import { handleShare } from "@/lib/share/request";
import { newShareToken, shareLinkState } from "@/lib/share/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowWrite = createRateLimiter({ limit: 10, windowMs: 60_000 });
const allowRead = createRateLimiter({ limit: 60, windowMs: 60_000 });
const noStore = { "Cache-Control": "no-store" };

/** This data source's links (never their tokens, which aren't stored). Behind APP_PASSWORD when set. */
export async function GET(request: Request) {
  if (!allowRead(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  if (mode === "demo") return NextResponse.json({ links: [], sample: "/s/demo" }, { headers: noStore });
  if (!canWriteRealData(mode)) return NextResponse.json({ error: "Set APP_PASSWORD before making share links." }, { status: 403 });
  if (!persistentStorageReady()) return NextResponse.json({ error: "Set DATABASE_URL to make share links." }, { status: 503 });
  try {
    const links = await getStore(await scopeFor(mode)).listShareLinks();
    return NextResponse.json(
      { links: links.map(({ payload: _payload, ...l }) => ({ ...l, state: shareLinkState(l) })) },
      { headers: noStore },
    );
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[share] list failed", err);
    return NextResponse.json({ error: "Couldn’t load your links." }, { status: 500 });
  }
}

/** Create or revoke a link. Cross-site writes are refused by the proxy. */
export async function POST(request: Request) {
  if (!allowWrite(clientIp(request))) return NextResponse.json({ error: "Too many requests. Wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null);
  try {
    const result = await handleShare(body, {
      storeFor: async (mode) => getStore(await scopeFor(mode)),
      snapshotFor: (mode, company) => snapshotFor(mode, company),
      canWrite: canWriteRealData,
      now: () => new Date(),
      newToken: newShareToken,
      storageReady: persistentStorageReady,
    });
    return NextResponse.json(result.body, { status: result.status, headers: noStore });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[share] change failed", err);
    return NextResponse.json({ error: "Couldn’t do that just now. Try again." }, { status: 500 });
  }
}
