import { NextResponse } from "next/server";
import { z } from "zod";
import { removeTeammate, sessionUser } from "@/lib/server/company";
import { SignInRequired } from "@/lib/server/errors";
import { teamError } from "@/lib/server/team-route";

export const runtime = "nodejs";

// Supabase user ids are UUIDs; anything else is refused before it reaches the database.
const body = z.object({ userId: z.uuid() });

/** The owner removes a teammate (never the owner). They lose access on their next request. */
export async function POST(request: Request) {
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return (await removeTeammate(parsed.data.userId)) ? NextResponse.json({ removed: true }) : NextResponse.json({ error: "No such teammate." }, { status: 404 });
  } catch (err) {
    return teamError(err, "remove");
  }
}
