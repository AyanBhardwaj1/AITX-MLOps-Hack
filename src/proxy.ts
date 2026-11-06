import { createProxy } from "./lib/auth/proxy";
import { getUserForProxy, supabaseSettings } from "./lib/auth/supabase";

/**
 * Refuses cross-site API writes and strips client-sent identity headers on every request. With
 * accounts on (Supabase configured) it attaches the verified user; otherwise it applies the
 * optional shared password (APP_PASSWORD) to everything but the public pages (isPublicPath).
 */
export const proxy = createProxy({
  authConfigured: () => supabaseSettings() !== null,
  appPassword: () => process.env.APP_PASSWORD || undefined,
  getUser: getUserForProxy,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image).*)"],
};
