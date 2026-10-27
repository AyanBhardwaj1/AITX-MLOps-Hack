import { NextResponse } from "next/server";
import { z } from "zod";
import { runAutopilot } from "@/lib/agent/autopilot";
import { loadDataset } from "@/lib/server/data";
import { hasJira, hasOpenAI } from "@/lib/server/env";
import { fileJiraTicket } from "@/lib/server/jira-client";
import { writeMemoWithLLM } from "@/lib/server/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ mode: z.enum(["demo", "sandbox"]).default("demo") });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { mode } = parsed.data;
  const run = await runAutopilot({
    loadData: () => loadDataset(mode),
    writeMemo: hasOpenAI() ? writeMemoWithLLM : undefined,
    fileTicket: hasJira() ? fileJiraTicket : undefined,
  });
  if (run.status === "failed") console.error("[autopilot] run failed", { mode, error: run.error });
  // allow-lists are internal plumbing for the memo check; the client doesn't need them.
  const { memoFacts: _facts, ...publicRun } = run;
  return NextResponse.json(publicRun, { status: run.status === "failed" ? 502 : 200 });
}
