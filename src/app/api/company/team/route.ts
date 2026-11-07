import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_TEAM_SIZE } from "@/lib/accounts/types";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { currentTeam, inviteTeammate, sessionUser } from "@/lib/server/company";
import { SignInRequired } from "@/lib/server/errors";
import { teamError } from "@/lib/server/team-route";
import { readJsonCapped } from "@/lib/http-body";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const body = z.object({ email: z.string().trim().max(254).pipe(z.email({ pattern: z.regexes.html5Email })) });

const MESSAGES = {
  invited: null,
  exists: "They’re already invited.",
  member: "They’re already on the team.",
  limit: `A company can have up to ${MAX_TEAM_SIZE} people, counting invites.`,
  not_owner: "Only the company’s owner can invite people.",
} as const;

/** The team: members and pending invites. */
export async function GET() {
  try {
    return NextResponse.json(await currentTeam(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return teamError(err, "list");
  }
}

/** The owner invites a teammate; they join when they first sign in with that email. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await readJsonCapped(request));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    const result = await inviteTeammate(parsed.data.email);
    const message = MESSAGES[result];
    if (message) return NextResponse.json({ error: message, result }, { status: result === "not_owner" ? 403 : 409 });
    return NextResponse.json({ result });
  } catch (err) {
    return teamError(err, "invite");
  }
}
