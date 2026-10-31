import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth, isCrossSiteWrite } from "./lib/access";

/**
 * Refuses cross-site writes to the API (CSRF), then applies the optional site-wide password
 * (HTTP Basic). The password is off unless APP_PASSWORD is set; required before a
 * real Rho account can be shown. The cron route (own secret), the health check and the
 * link-preview image are excluded.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && isCrossSiteWrite(request.method, request.headers, request.headers.get("host"))) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (checkBasicAuth(request.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Runway", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron/|api/health|_next/static|_next/image|favicon.ico|icon.svg|opengraph-image).*)"],
};
