import { NextResponse } from "next/server";
import { z } from "zod";
import { companyNameSchema } from "@/lib/accounts/types";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { renameCurrentCompany, sessionUser } from "@/lib/server/company";
import { accessErrorResponse, SignInRequired } from "@/lib/server/errors";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const body = z.object({ name: companyNameSchema });

/** Renames the signed-in owner's company. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  try {
    // Who's asking comes first, so a signed-out request learns nothing about validation.
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await readJsonCapped(request));
    if (!parsed.success) return NextResponse.json({ error: "Enter a name of 1 to 80 characters." }, { status: 400 });
    return NextResponse.json({ name: await renameCurrentCompany(parsed.data.name) });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[company] rename failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t rename the company. Try again." }, { status: 500 });
  }
}
