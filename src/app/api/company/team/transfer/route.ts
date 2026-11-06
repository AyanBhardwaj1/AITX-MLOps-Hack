import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionUser, transferCompany } from "@/lib/server/company";
import { SignInRequired } from "@/lib/server/errors";
import { teamError } from "@/lib/server/team-route";

export const runtime = "nodejs";

const body = z.object({ userId: z.uuid() });

/** The owner makes a teammate the owner (renaming, deleting and managing the team move with it). */
export async function POST(request: Request) {
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    if (await transferCompany(parsed.data.userId)) return NextResponse.json({ transferred: true });
    return NextResponse.json({ error: "Only a current teammate can become the owner." }, { status: 404 });
  } catch (err) {
    return teamError(err, "transfer");
  }
}
