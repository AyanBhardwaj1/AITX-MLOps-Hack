import { createAgentUIStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { DEMO_BUDGETS } from "@/lib/seed/demo-budgets";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { sanitizeChatMessages } from "@/lib/agent/chat-input";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { createCopilot, type CopilotBudgets, type SaveDraft } from "@/lib/server/copilot";
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
  mode: dataModeSchema,
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

  let analysis: Awaited<ReturnType<typeof loadAnalysis>>["analysis"];
  let store: ReturnType<typeof getStore>;
  try {
    ({ analysis } = await loadAnalysis(parsed.data.mode));
    store = getStore(await scopeFor(parsed.data.mode));
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    throw err;
  }
  // Findings must exist in the store so drafts can link to them; a database hiccup shouldn't block chat.
  const statuses = await store.syncFindings(analysis.findings).catch((err) => {
    console.error("[copilot] finding sync failed", err);
    return new Map<string, string>();
  });
  const dismissed = new Set([...statuses].filter(([, s]) => s === "dismissed").map(([id]) => id));
  const saveDraft: SaveDraft = async (d) => {
    const [saved] = await store.saveDrafts([
      { fingerprint: d.fingerprint, findingFingerprint: d.findingId, kind: d.kind, title: d.title, body: d.body, createdBy: "copilot" },
    ]);
    return { id: saved!.id, status: saved!.status };
  };
  // The demo's fixed sample (measured with this visitor's own category fixes, as the card is), or
  // the company's own; a storage hiccup means no budgets, not a failed chat.
  const mode = parsed.data.mode;
  const budgets: CopilotBudgets =
    mode === "demo"
      ? { list: DEMO_BUDGETS, analysis: (await loadAnalysis("demo", { visitorFixes: true })).analysis }
      : mode === "company"
        ? {
            list: await store.listBudgets().catch((err) => {
              console.error("[copilot] budgets unavailable", err instanceof Error ? err.message : "unknown error");
              return [];
            }),
          }
        : { list: [], emptyNote: "Budgets are for a signed-in company's own data; the Rho sandbox has none." };
  return createAgentUIStreamResponse({ agent: createCopilot(analysis, saveDraft, dismissed, budgets), uiMessages: messages.messages });
}
