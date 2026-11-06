import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { companySlackStatus, ownerCompany } from "@/lib/server/company";
import { accessErrorResponse } from "@/lib/server/errors";
import { getStore } from "@/lib/server/store";
import { isSlackWebhookUrl, postToSlack } from "@/lib/slack";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });
const body = z.object({ url: z.string().trim().max(300).refine(isSlackWebhookUrl, "not a Slack webhook").nullable() });

/** Whether the company's own Slack is connected, with a masked hint (never the URL). */
export async function GET() {
  try {
    return NextResponse.json(await companySlackStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[slack] status failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t check Slack just now." }, { status: 500 });
  }
}

/** The owner connects the company's Slack (a test message must go through first) or removes it. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  try {
    // Owner first: nobody else can make the server post anywhere.
    const company = await ownerCompany();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…)." }, { status: 400 });
    const { url } = parsed.data;
    if (url) {
      try {
        await postToSlack(url, `Runway is connected. ${company.name}'s Monday digest will arrive in this channel.`);
      } catch {
        return NextResponse.json({ error: "Slack didn’t accept that webhook. Check it and try again." }, { status: 400 });
      }
    }
    await getStore(company.scope).setSlackWebhook(url);
    return NextResponse.json({ connected: url !== null });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[slack] update failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t save that just now." }, { status: 500 });
  }
}
