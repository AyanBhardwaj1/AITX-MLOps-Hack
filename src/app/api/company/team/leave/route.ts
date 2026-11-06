import { NextResponse } from "next/server";
import { leaveCurrentCompany } from "@/lib/server/company";
import { teamError } from "@/lib/server/team-route";

export const runtime = "nodejs";

/** A member leaves their company's team. The owner can't: they delete the company instead. */
export async function POST() {
  try {
    const result = await leaveCurrentCompany();
    // Already removed by the owner: the outcome they asked for.
    if (result !== "owner") return NextResponse.json({ left: true });
    return NextResponse.json({ error: "The owner can't leave their own company. Make a teammate the owner, or delete the company." }, { status: 409 });
  } catch (err) {
    return teamError(err, "leave");
  }
}
