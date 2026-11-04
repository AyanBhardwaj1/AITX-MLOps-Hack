import { NextResponse } from "next/server";
import { assertSafeToServe } from "@/lib/access";
import { analyze } from "@/lib/pipeline";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadDataset } from "@/lib/server/data";
import { env } from "@/lib/server/env";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import type { VendorCorrection } from "@/lib/vendors/corrections";
import { handleCorrection, type CorrectionSink } from "@/lib/vendors/correction-request";
import { DEMO_CORRECTIONS_COOKIE, MAX_DEMO_CORRECTIONS, decodeDemoCorrections, encodeDemoCorrections } from "@/lib/vendors/demo-cookie";

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

function canWrite(mode: "demo" | "sandbox"): boolean {
  if (mode === "demo") return true;
  try {
    const e = env();
    assertSafeToServe({ rhoBaseUrl: e.RHO_BASE_URL, appPassword: e.APP_PASSWORD });
    return true;
  } catch {
    return false;
  }
}

/** Set or clear a person's category fix for one vendor. Behind APP_PASSWORD when set; cross-site writes are refused by the proxy. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many changes. Wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const demo = demoSink(decodeDemoCorrections(cookieValue(request, DEMO_CORRECTIONS_COOKIE)));
  try {
    const result = await handleCorrection(body, {
      sinkFor: (mode) => (mode === "demo" ? demo.sink : getStore(scopeFor(mode))),
      knownVendorKeys: async (mode) => new Set(analyze(await loadDataset(mode)).txns.map((t) => t.vendor.key)),
      canWrite,
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
    console.error("[corrections] save failed", err);
    return NextResponse.json({ error: "Couldn’t save that change. Try again." }, { status: 500 });
  }
}
