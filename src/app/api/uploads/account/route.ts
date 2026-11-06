import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { sessionUser } from "@/lib/server/company";
import { accessErrorResponse, SignInRequired } from "@/lib/server/errors";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const body = z.object({ account: z.string().trim().min(1).max(80) });

/** Deletes one uploaded account's rows from the signed-in company, e.g. a file uploaded by mistake. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const deleted = await getStore(await scopeFor("company")).deleteUploadedAccount(parsed.data.account);
    return NextResponse.json({ deleted });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[uploads] account delete failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t delete that just now. Try again." }, { status: 500 });
  }
}
