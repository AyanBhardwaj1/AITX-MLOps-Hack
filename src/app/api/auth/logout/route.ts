import { NextResponse } from "next/server";
import { supabaseForRoute } from "@/lib/auth/supabase-route";

export const runtime = "nodejs";

/** Sign out: revoke the session and clear its cookies, then go home. */
export async function POST(request: Request) {
  const supabase = await supabaseForRoute();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[auth] sign-out failed", error.message);
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
