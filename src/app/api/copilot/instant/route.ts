import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { instantAnswer, instantQuestionInput } from "@/lib/agent/instant";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadAnalysis } from "@/lib/server/data";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { DEMO_BUDGETS } from "@/lib/seed/demo-budgets";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });
const body = z.object({
  mode: dataModeSchema,
  question: instantQuestionInput,
  /** Findings this person dismissed on the page; read-only, so asking never writes shared state. */
  dismissed: z.array(z.string().max(200)).max(100).default([]),
});

/** Copilot's suggested questions answered from the tools alone (no LLM), for when OpenAI isn't configured. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const parsed = body.safeParse(await readJsonCapped(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const { mode, question } = parsed.data;
    const { analysis } = await loadAnalysis(mode, { visitorFixes: true });
    // Read only for the budget question: the demo's sample, or the signed-in company's own.
    // A storage hiccup says so in the answer rather than failing it (or claiming there are none).
    const budgets =
      question !== "budgets"
        ? []
        : mode === "sandbox"
          ? null
          : mode === "demo"
            ? DEMO_BUDGETS
            : await getStore(await scopeFor(mode))
                .listBudgets()
                .catch((err) => {
                  console.error("[copilot/instant] budgets unavailable", err instanceof Error ? err.message : "unknown error");
                  return "unavailable" as const;
                });
    return NextResponse.json(instantAnswer(analysis, question, new Set(parsed.data.dismissed), budgets));
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[copilot/instant] failed", err);
    return NextResponse.json({ error: "Couldn't load the data. Try again." }, { status: 500 });
  }
}
