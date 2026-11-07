import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { enrichTransactions } from "@/lib/pipeline";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadDataset } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { canWriteRealData } from "@/lib/server/write-guard";
import { getStore } from "@/lib/server/store";
import type { VendorCorrection } from "@/lib/vendors/corrections";
import { handleCorrection, type CorrectionSink } from "@/lib/vendors/correction-request";
import { DEMO_CORRECTIONS_COOKIE, MAX_DEMO_CORRECTIONS, decodeDemoCorrections, encodeDemoCorrections } from "@/lib/vendors/demo-cookie";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });
const DEMO_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** The demo visitor's own fixes, kept in their cookie so nobody else's numbers change. */
function demoSink(initial: VendorCorrection[]) {
  const fixes = new Map(initial.map((c) => [c.vendorKey, c]));
  let changed = false;
  const sink: CorrectionSink = {
    maxCorrections: MAX_DEMO_CORRECTIONS,
    async setCorrection(c, max) {
      if (!fixes.has(c.vendorKey) && fixes.size >= Math.min(max, MAX_DEMO_CORRECTIONS)) return "limit";
      fixes.set(c.vendorKey, c);
      changed = true;
      return "saved";
    },
    async clearCorrection(vendorKey) {
      changed = fixes.delete(vendorKey) || changed;
    },
  };
  return { sink, changed: () => changed, value: () => encodeDemoCorrections([...fixes.values()]) };
}


/** Set or clear a person's category fix for one vendor. Behind APP_PASSWORD when set; cross-site writes are refused by the proxy. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many changes. Wait a minute." }, { status: 429 });
  const body = await readJsonCapped(request);
  const demo = demoSink(decodeDemoCorrections(cookieValue(request, DEMO_CORRECTIONS_COOKIE)));
  try {
    const result = await handleCorrection(body, {
      sinkFor: async (mode) => (mode === "demo" ? demo.sink : getStore(await scopeFor(mode))),
      // Only the vendors are needed: mapping alone, not the whole analysis (seconds on a big company).
      knownVendorKeys: async (mode) => new Set(enrichTransactions(await loadDataset(mode)).map((t) => t.vendor.key)),
      canWrite: canWriteRealData,
    });
    const res = NextResponse.json(result.body, { status: result.status });
    if (demo.changed()) {
      res.cookies.set(DEMO_CORRECTIONS_COOKIE, demo.value(), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: DEMO_COOKIE_MAX_AGE_S,
      });
    }
    return res;
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[corrections] save failed", err);
    return NextResponse.json({ error: "Couldn’t save that change. Try again." }, { status: 500 });
  }
}
