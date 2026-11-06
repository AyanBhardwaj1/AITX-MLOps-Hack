import { NextResponse } from "next/server";
import { buildInvestorUpdate, investorUpdateInput } from "@/lib/insights/investor-update";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { companyName } from "@/lib/server/company";
import { accessErrorResponse } from "@/lib/server/errors";
import { loadAnalysis, parseMode } from "@/lib/server/data";
import { savingsFor } from "@/lib/server/savings";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** Drafts this month's investor update from the bank feed (numbers only; the founder writes the rest). */
export async function GET(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  try {
    const { dataset, analysis } = await loadAnalysis(mode, { visitorFixes: true });
    const savings = await savingsFor(mode, dataset, analysis);
    return NextResponse.json(buildInvestorUpdate(investorUpdateInput(analysis, { company: await companyName(mode), verifiedSavingsCents: savings.verifiedMonthlyCents })));
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[investor-update] failed", err);
    return NextResponse.json({ error: "Couldn't draft the update. Try again." }, { status: 500 });
  }
}
