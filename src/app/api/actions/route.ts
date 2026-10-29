import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { hasJira } from "@/lib/server/env";
import { fileJiraTicket } from "@/lib/server/jira-client";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { StoreError } from "@/lib/store/types";

export const runtime = "nodejs";

const LIST_LIMIT = 50;
const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    return NextResponse.json({ actions: await getStore(scopeFor(mode)).listActions(LIST_LIMIT) });
  } catch (err) {
    console.error("[actions] list failed", err);
    return NextResponse.json({ error: "Couldn't load the inbox." }, { status: 500 });
  }
}

const decideBody = z.object({
  mode: z.enum(["demo", "sandbox"]).default("demo"),
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * A person approves or rejects a draft. Approved Jira tickets are filed right away (idempotently,
 * by the finding's label); other approved drafts are ready to copy and send.
 */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = decideBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const store = getStore(scopeFor(parseMode(parsed.data.mode)));
  try {
    const action = await store.decideAction(parsed.data.id, parsed.data.decision);
    if (action.status === "approved" && action.kind === "jira_ticket" && hasJira()) {
      try {
        const { externalRef } = await fileJiraTicket({
          fingerprint: action.fingerprint,
          findingId: action.findingFingerprint ?? action.fingerprint,
          kind: action.kind,
          status: "draft",
          title: action.title,
          body: action.body,
        });
        await store.markActionSent(action.id, externalRef);
        return NextResponse.json({ action: { ...action, status: "sent", externalRef } });
      } catch (err) {
        console.error("[actions] Jira filing failed after approval", { id: action.id, err });
        return NextResponse.json({ action, warning: "Approved, but filing in Jira failed. Check the server logs." });
      }
    }
    return NextResponse.json({ action });
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: err.code === "not_found" ? 404 : 409 });
    console.error("[actions] decision failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
