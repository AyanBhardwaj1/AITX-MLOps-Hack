import { NextResponse } from "next/server";
import { z } from "zod";
import { findingsCsv, recurringCsv } from "@/lib/export/csv";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadAnalysis } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const query = z.object({ mode: z.enum(["demo", "sandbox"]).default("demo"), kind: z.enum(["recurring", "findings"]) });

/** CSV download of recurring charges or findings. Behind APP_PASSWORD when set, like the rest of the app. */
export async function GET(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const parsed = query.safeParse({ mode: params.get("mode") ?? undefined, kind: params.get("kind") });
  if (!parsed.success) return NextResponse.json({ error: "Choose kind=recurring or kind=findings" }, { status: 400 });
  const { mode, kind } = parsed.data;
  try {
    const { analysis } = await loadAnalysis(mode, { visitorFixes: true });
    let body: string;
    if (kind === "recurring") body = recurringCsv(analysis);
    else {
      const statuses = await getStore(scopeFor(mode))
        .syncFindings(analysis.findings)
        .catch((err) => {
          console.error("[export] statuses unavailable; exporting findings as open", err);
          return new Map<string, string>();
        });
      body = findingsCsv(analysis.findings, statuses);
    }
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="runway-${kind}-${analysis.asOf}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export] failed", err);
    return NextResponse.json({ error: "Couldn’t build that export." }, { status: 500 });
  }
}
