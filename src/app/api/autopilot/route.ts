import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { executeAutopilot } from "@/lib/server/autopilot-service";
import { parseMode } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";
export const maxDuration = 60;

const RECENT_RUNS = 10;
const allow = createRateLimiter({ limit: 5, windowMs: 60_000 });
const body = z.object({ mode: dataModeSchema });

export async function POST(request: Request) {
  if (!allow(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse((await readJsonCapped(request)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const run = await executeAutopilot(parsed.data.mode, "manual");
    return NextResponse.json(run, { status: run.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[autopilot] run failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Autopilot couldn't run. Try again." }, { status: 500 });
  }
}

/** Recent runs, newest first, for the Autopilot history list. */
export async function GET(request: Request) {
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    return NextResponse.json({ runs: await getStore(await scopeFor(mode)).listRuns(RECENT_RUNS) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[autopilot] history failed", err);
    return NextResponse.json({ error: "Couldn't load run history." }, { status: 500 });
  }
}
