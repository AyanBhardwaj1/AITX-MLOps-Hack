import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeTeammateInvite, sessionUser } from "@/lib/server/company";
import { SignInRequired } from "@/lib/server/errors";
import { teamError } from "@/lib/server/team-route";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const body = z.object({ email: z.string().trim().min(3).max(254) });

/** The owner withdraws a pending invite. */
export async function POST(request: Request) {
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await readJsonCapped(request));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return (await revokeTeammateInvite(parsed.data.email)) ? NextResponse.json({ revoked: true }) : NextResponse.json({ error: "No such invite." }, { status: 404 });
  } catch (err) {
    return teamError(err, "revoke");
  }
}
