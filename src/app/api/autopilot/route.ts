import { NextResponse } from "next/server";
import { z } from "zod";
import { runAutopilot } from "@/lib/agent/autopilot";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadDataset } from "@/lib/server/data";
import { hasJira, hasOpenAI } from "@/lib/server/env";
import { fileJiraTicket } from "@/lib/server/jira-client";
import { writeMemoWithLLM } from "@/lib/server/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

const allow = createRateLimiter({ limit: 5, windowMs: 60_000 });
const body = z.object({ mode: z.enum(["demo", "sandbox"]).default("demo") });

export async function POST(request: Request) {
  if (!allow(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { mode } = parsed.data;
  const run = await runAutopilot({
    loadData: () => loadDataset(mode),
    writeMemo: hasOpenAI() ? writeMemoWithLLM : undefined,
    fileTicket: hasJira() ? fileJiraTicket : undefined,
  });

  // Full details stay in server logs; the browser gets step names and statuses only.
  const failedSteps = run.steps.filter((s) => s.status === "failed" || "error" in s.detail);
  const failedTickets = run.tickets.filter((t) => t.error);
  if (failedSteps.length || failedTickets.length) {
    console.error("[autopilot] errors", { mode, steps: failedSteps, tickets: failedTickets.map((t) => ({ fingerprint: t.fingerprint, error: t.error })), error: run.error });
  }
  const { memoFacts: _facts, ...publicRun } = run;
  const redacted = {
    ...publicRun,
    error: run.error ? "Autopilot couldn't finish. Check the server logs." : undefined,
    tickets: run.tickets.map(({ error: _e, ...t }) => t),
    steps: run.steps.map((s) => {
      const { error: _e, ...detail } = s.detail;
      return { ...s, detail };
    }),
  };
  return NextResponse.json(redacted, { status: run.status === "failed" ? 502 : 200 });
}
