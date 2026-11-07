import { NextResponse } from "next/server";
import { supabaseForRoute } from "@/lib/auth/supabase-route";
import { TIME_ZONE_COOKIE } from "@/lib/time-zone-cookie";

export const runtime = "nodejs";

/** Sign out: revoke the session and clear its cookies, then go home. */
export async function POST(request: Request) {
  const supabase = await supabaseForRoute();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[auth] sign-out failed", error.message);
  }
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  // The time zone is only for the signed-in app: it goes with the session.
  res.cookies.delete(TIME_ZONE_COOKIE);
  return res;
}
