import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptCompanyInvite, sessionUser } from "@/lib/server/company";
import { SignInRequired } from "@/lib/server/errors";
import { teamError } from "@/lib/server/team-route";

export const runtime = "nodejs";

const body = z.object({ orgId: z.uuid() });

const REFUSED = {
  no_invite: { status: 404, error: "That invite is no longer open." },
  has_team: { status: 409, error: "You own a company with teammates. Remove them or delete it first." },
  has_data: {
    status: 409,
    error: "Your current company still has data of its own (uploads, budgets, category fixes, investor links or a Slack channel). Delete that company in settings, then accept.",
  },
} as const;

/** The signed-in user accepts a company's invite to its team. */
export async function POST(request: Request) {
  try {
    if (!(await sessionUser())) throw new SignInRequired();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const result = await acceptCompanyInvite(parsed.data.orgId);
    if (result === "joined") return NextResponse.json({ joined: true });
    return NextResponse.json({ error: REFUSED[result].error }, { status: REFUSED[result].status });
  } catch (err) {
    return teamError(err, "accept");
  }
}
