import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/server/errors";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

/** Deletes everything the signed-in company uploaded (transactions and the entered cash). */
export async function POST() {
  try {
    await getStore(await scopeFor("company")).clearUploads();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[uploads] clear failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t delete that just now. Try again." }, { status: 500 });
  }
}
