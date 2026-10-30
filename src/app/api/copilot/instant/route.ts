import { NextResponse } from "next/server";
import { z } from "zod";
import { instantAnswer, instantQuestionInput } from "@/lib/agent/instant";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadAnalysis } from "@/lib/server/data";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });
const body = z.object({
  mode: z.enum(["demo", "sandbox"]).default("demo"),
  question: instantQuestionInput,
});

/** Copilot's suggested questions answered from the tools alone (no LLM), for when OpenAI isn't configured. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const { analysis } = await loadAnalysis(parsed.data.mode);
    return NextResponse.json(instantAnswer(analysis, parsed.data.question));
  } catch (err) {
    console.error("[copilot/instant] failed", err);
    return NextResponse.json({ error: "Couldn't load the data. Try again." }, { status: 500 });
  }
}
