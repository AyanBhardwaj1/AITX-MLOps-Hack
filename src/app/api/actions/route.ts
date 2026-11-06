import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { parseMode } from "@/lib/server/data";
import { canFileJiraFromApp } from "@/lib/server/env";
import { fileJiraTicket } from "@/lib/server/jira-client";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { isStoreError } from "@/lib/store/types";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const LIST_LIMIT = 50;
const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    // Drafts for findings the team dismissed are hidden (and can't be approved); reopening the finding brings them back.
    return NextResponse.json({ actions: await getStore(await scopeFor(mode)).listActions(LIST_LIMIT, { inbox: true }) });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[actions] list failed", err);
    return NextResponse.json({ error: "Couldn't load the inbox." }, { status: 500 });
  }
}

const decideBody = z.object({
  mode: dataModeSchema,
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * A person approves or rejects a draft. Approved Jira tickets are filed right away (idempotently,
 * by the finding's label); other approved drafts are ready to copy and send.
 */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = decideBody.safeParse(await readJsonCapped(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const mode = parseMode(parsed.data.mode);
    const store = getStore(await scopeFor(mode));
    const current = await store.getAction(parsed.data.id);
    if (!current) return NextResponse.json({ error: "Action not found" }, { status: 404 });
    if (current.status !== "draft") return NextResponse.json({ error: `Action is already ${current.status}` }, { status: 409 });
    // Waste the team dismissed is never acted on, whatever drafts are left over.
    if (parsed.data.decision === "approved" && current.findingFingerprint && (await store.findingStatus(current.findingFingerprint)) === "dismissed") {
      return NextResponse.json({ error: "Its finding was dismissed, so this draft can't be approved." }, { status: 409 });
    }
    // The public demo's Inbox is shared by every visitor: a decision shows for whoever made it but
    // isn't saved, so the next visitor still sees the drafts (and nothing is ever filed).
    if (mode === "demo") return NextResponse.json({ action: { ...current, status: parsed.data.decision } });
    const action = await store.decideAction(parsed.data.id, parsed.data.decision);
    if (action.status === "approved" && action.kind === "jira_ticket" && canFileJiraFromApp()) {
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
    const known = accessErrorResponse(err);
    if (known) return known;
    if (isStoreError(err)) return NextResponse.json({ error: err.message }, { status: err.code === "not_found" ? 404 : 409 });
    console.error("[actions] decision failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
