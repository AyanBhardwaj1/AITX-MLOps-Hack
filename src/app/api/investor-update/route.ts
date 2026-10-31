import { NextResponse } from "next/server";
import { buildInvestorUpdate, investorUpdateInput } from "@/lib/insights/investor-update";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadAnalysis, parseMode } from "@/lib/server/data";
import { savingsFor } from "@/lib/server/savings";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const COMPANY = { demo: "Taco Robotics, Inc.", sandbox: "Our company" } as const;

/** Drafts this month's investor update from the bank feed (numbers only; the founder writes the rest). */
export async function GET(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    const { dataset, analysis } = await loadAnalysis(mode);
    const savings = await savingsFor(mode, dataset, analysis);
    return NextResponse.json(buildInvestorUpdate(investorUpdateInput(analysis, { company: COMPANY[mode], verifiedSavingsCents: savings.verifiedMonthlyCents })));
  } catch (err) {
    console.error("[investor-update] failed", err);
    return NextResponse.json({ error: "Couldn't draft the update. Try again." }, { status: 500 });
  }
}
