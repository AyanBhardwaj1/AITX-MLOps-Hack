import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth, isCrossSiteWrite, isPublicPath } from "./lib/access";

/**
 * Refuses cross-site writes to the API (CSRF), then applies the optional site-wide password
 * (HTTP Basic). The password is off unless APP_PASSWORD is set; required before a
 * real Rho account can be shown. The marketing site, legal pages, grader, signup, cron (own
 * secret) and health check stay public (isPublicPath); static assets skip the proxy entirely.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && isCrossSiteWrite(request.method, request.headers, request.headers.get("host"))) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  const password = process.env.APP_PASSWORD;
  if (!password || isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  if (checkBasicAuth(request.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Runway", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image).*)"],
};
