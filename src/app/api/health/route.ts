import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uptime check. Public (outside the password gate) so monitors can reach it, so it reports
 * only whether things work: no configuration values, account data or error messages.
 */
export async function GET() {
  const database = await pingDatabase();
  const ok = database !== "unreachable";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
