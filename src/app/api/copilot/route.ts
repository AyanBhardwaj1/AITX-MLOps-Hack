import { createAgentUIStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeChatMessages } from "@/lib/agent/chat-input";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { createCopilot, type SaveDraft } from "@/lib/server/copilot";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { loadAnalysis } from "@/lib/server/data";
import { hasOpenAI } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

const body = z.object({
  messages: z.unknown(),
  mode: z.enum(["demo", "sandbox"]).default("demo"),
});

export async function POST(request: Request) {
  if (!hasOpenAI()) {
    return NextResponse.json({ error: "Copilot needs OPENAI_API_KEY on the server." }, { status: 503 });
  }
  if (!allow(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const messages = sanitizeChatMessages(parsed.data.messages);
  if (!messages.ok) return NextResponse.json({ error: messages.error }, { status: 400 });

  const { analysis } = await loadAnalysis(parsed.data.mode);
  const store = getStore(scopeFor(parsed.data.mode));
  // Findings must exist in the store so drafts can link to them; a database hiccup shouldn't block chat.
  await store.syncFindings(analysis.findings).catch((err) => console.error("[copilot] finding sync failed", err));
  const saveDraft: SaveDraft = async (d) => {
    const [saved] = await store.saveDrafts([
      { fingerprint: d.fingerprint, findingFingerprint: d.findingId, kind: d.kind, title: d.title, body: d.body, createdBy: "copilot" },
    ]);
    return { id: saved!.id, status: saved!.status };
  };
  return createAgentUIStreamResponse({ agent: createCopilot(analysis, saveDraft), uiMessages: messages.messages });
}
