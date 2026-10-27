import { createAgentUIStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createCopilot } from "@/lib/server/copilot";
import { loadAnalysis } from "@/lib/server/data";
import { hasOpenAI } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Caps cost per request; long chats keep only the most recent turns. */
const MAX_MESSAGES = 30;

const body = z.object({
  messages: z.array(z.unknown()).min(1),
  mode: z.enum(["demo", "sandbox"]).default("demo"),
});

export async function POST(request: Request) {
  if (!hasOpenAI()) {
    return NextResponse.json({ error: "Copilot needs OPENAI_API_KEY on the server." }, { status: 503 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { analysis } = await loadAnalysis(parsed.data.mode);
  return createAgentUIStreamResponse({
    agent: createCopilot(analysis),
    // Validated as UI messages by the AI SDK; we only bound the count here.
    uiMessages: parsed.data.messages.slice(-MAX_MESSAGES),
  });
}
