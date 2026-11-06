import { NextResponse } from "next/server";
import { leaveCurrentCompany } from "@/lib/server/company";
import { teamError } from "@/lib/server/team-route";

export const runtime = "nodejs";

/** A member leaves their company's team. The owner can't: they delete the company instead. */
export async function POST() {
  try {
    if (await leaveCurrentCompany()) return NextResponse.json({ left: true });
    return NextResponse.json({ error: "The owner can't leave their own company. Delete it in settings instead." }, { status: 409 });
  } catch (err) {
    return teamError(err, "leave");
  }
}
