import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth, isCrossSiteWrite, isPublicPath } from "../access";
import { EMAIL_HEADER, stripInternalHeaders, USER_HEADER, type SessionUser } from "./session";

export interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export interface ProxyDeps {
  authConfigured: () => boolean;
  appPassword: () => string | undefined;
  /** Verifies the session (refreshing it if needed); returns cookies to write back. */
  getUser: (request: NextRequest) => Promise<{ user: SessionUser | null; setCookies: CookieToSet[] }>;
}

/** Pages that show a signed-in company's own data; the public demo at /app stays open. */
function needsSignIn(url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, "");
  return path === "/app/upload" || (path === "/app" && url.searchParams.get("mode") === "company");
}

/**
 * Every request (but static assets): refuse cross-site API writes, strip client-sent identity
 * headers, then either attach the verified Supabase user (accounts on) or apply the shared
 * password (accounts off).
 */
export function createProxy(deps: ProxyDeps) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    if (request.nextUrl.pathname.startsWith("/api/") && isCrossSiteWrite(request.method, request.headers, request.headers.get("host"))) {
      return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
    }
    const headers = stripInternalHeaders(request.headers);

    if (deps.authConfigured()) {
      const { user, setCookies } = await deps.getUser(request);
      if (user) {
        headers.set(USER_HEADER, user.id);
        if (user.email) headers.set(EMAIL_HEADER, user.email);
      }
      const res = !user && needsSignIn(request.nextUrl) ? signInRedirect(request.nextUrl) : NextResponse.next({ request: { headers } });
      for (const c of setCookies) res.cookies.set(c.name, c.value, c.options);
      return res;
    }

    const password = deps.appPassword();
    if (password && !isPublicPath(request.nextUrl.pathname) && !checkBasicAuth(request.headers.get("authorization"), password)) {
      return new NextResponse("Password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Runway", charset="UTF-8"' } });
    }
    return NextResponse.next({ request: { headers } });
  };
}

function signInRedirect(url: URL): NextResponse {
  const to = new URL("/login", url);
  to.searchParams.set("next", `${url.pathname}${url.search}`);
  return NextResponse.redirect(to, 307);
}
