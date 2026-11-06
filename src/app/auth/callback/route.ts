import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NEXT_COOKIE, safeNextPath } from "@/lib/auth/session";
import { supabaseForRoute } from "@/lib/auth/supabase-route";
import { companyAtSignIn } from "@/lib/server/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The magic link lands here: swap the one-time code for a session, make sure the user has a company, continue. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const fail = NextResponse.redirect(new URL("/login?error=link", url.origin), { status: 303 });
  const supabase = await supabaseForRoute();
  if (!supabase || !code || code.length > 512) return fail;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth] code exchange failed", error?.message ?? "no user");
    return fail;
  }
  try {
    await companyAtSignIn({ id: data.user.id, email: data.user.email ?? null });
  } catch (err) {
    if (err instanceof Error && err.name === "NotInvited") {
      // Signed in, but not invited: end the session rather than leave a useless one behind.
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=invite", url.origin), { status: 303 });
    }
    console.error("[auth] couldn't set up the company", err instanceof Error ? err.message : "unknown error");
    return NextResponse.redirect(new URL("/login?error=setup", url.origin), { status: 303 });
  }
  // Back to the page that asked for sign-in (remembered by the login request), checked again here.
  const jar = await cookies();
  const next = safeNextPath(jar.get(NEXT_COOKIE)?.value ?? null);
  jar.set(NEXT_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
