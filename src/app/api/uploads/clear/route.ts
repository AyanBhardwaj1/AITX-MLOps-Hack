import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { ownerCompany } from "@/lib/server/company";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

/** The owner deletes everything the company uploaded, and everything worked out from it. */
export async function POST() {
  try {
    // Owner only: it also deletes the team's findings, drafts and share links.
    await getStore((await ownerCompany()).scope).clearUploads();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[uploads] clear failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t delete that just now. Try again." }, { status: 500 });
  }
}
