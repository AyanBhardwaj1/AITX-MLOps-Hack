import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { CookieToSet } from "./proxy";
import type { SessionUser } from "./session";

/** Read straight from process.env: the proxy can't load the server-only env module. */
export function supabaseSettings(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** For the proxy: verify the session cookie with Supabase (refreshing it if it has expired). */
export async function getUserForProxy(request: NextRequest): Promise<{ user: SessionUser | null; setCookies: CookieToSet[] }> {
  const settings = supabaseSettings();
  if (!settings) return { user: null, setCookies: [] };
  const setCookies: CookieToSet[] = [];
  const supabase = createServerClient(settings.url, settings.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const c of cookies) setCookies.push({ name: c.name, value: c.value, options: c.options });
      },
    },
  });
  try {
    // getUser() asks Supabase to validate the token; never trust the cookie's contents alone.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { user: null, setCookies };
    return { user: { id: data.user.id, email: data.user.email ?? null }, setCookies };
  } catch (err) {
    console.error("[auth] session check failed", err instanceof Error ? err.message : "unknown error");
    return { user: null, setCookies };
  }
}
