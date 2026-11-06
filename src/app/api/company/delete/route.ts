import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { deleteCurrentCompany, sessionUser } from "@/lib/server/company";
import { accessErrorResponse, SignInRequired } from "@/lib/server/errors";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 5, windowMs: 60_000 });
const body = z.object({ confirm: z.string().max(200) });

/** Deletes the signed-in owner's company and everything in it, once they type its name. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await readJsonCapped(request));
    const result = parsed.success ? await deleteCurrentCompany(parsed.data.confirm) : "mismatch";
    if (result === "mismatch") return NextResponse.json({ error: "Type the company’s name exactly to confirm." }, { status: 400 });
    if (result === "not_owner") return NextResponse.json({ error: "Only the owner can delete the company, and you no longer are." }, { status: 409 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[company] delete failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t delete the company. Try again." }, { status: 500 });
  }
}
