import { NextResponse } from "next/server";
import { handleLoginRequest } from "@/lib/auth/login";
import { supabaseForRoute } from "@/lib/auth/supabase-route";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { env } from "@/lib/server/env";
import { getWaitlist } from "@/lib/server/waitlist";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

const allow = createRateLimiter({ limit: 5, windowMs: 60_000 });
/** Per inbox, whatever IP asks: someone can't flood a person's email with links. */
const allowEmail = createRateLimiter({ limit: 3, windowMs: 10 * 60_000 });

/** Email a magic link. Server-side, so the PKCE verifier cookie is ours and the browser never calls Supabase. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  const supabase = await supabaseForRoute();
  if (!supabase) return NextResponse.json({ error: "Sign-in isn't set up on this deployment yet." }, { status: 503 });
  const origin = process.env.VERCEL ? siteUrl().origin : new URL(request.url).origin;
  const body = await request.json().catch(() => null);
  const result = await handleLoginRequest(body, {
    sendLink: async (email) => {
      // Skipped quietly, so the answer is the same and says nothing about the address.
      if (!allowEmail(email.toLowerCase())) return;
      // Invite mode: new accounts only for emails invited from the waitlist; existing users still get links.
      const mayCreate = env().SIGNUPS === "open" || (await getWaitlist()?.isInvited(email)) === true;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: mayCreate },
      });
      if (error) throw error;
    },
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
