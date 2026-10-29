import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { executeAutopilot } from "@/lib/server/autopilot-service";
import { parseMode } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const RECENT_RUNS = 10;
const allow = createRateLimiter({ limit: 5, windowMs: 60_000 });
const body = z.object({ mode: z.enum(["demo", "sandbox"]).default("demo") });

export async function POST(request: Request) {
  if (!allow(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const run = await executeAutopilot(parsed.data.mode, "manual");
  return NextResponse.json(run, { status: run.status === "failed" ? 502 : 200 });
}

/** Recent runs, newest first, for the Autopilot history list. */
export async function GET(request: Request) {
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    return NextResponse.json({ runs: await getStore(scopeFor(mode)).listRuns(RECENT_RUNS) });
  } catch (err) {
    console.error("[autopilot] history failed", err);
    return NextResponse.json({ error: "Couldn't load run history." }, { status: 500 });
  }
}
