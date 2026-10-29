import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth } from "./lib/access";

/**
 * Optional site-wide password (HTTP Basic). Off unless APP_PASSWORD is set; required before a
 * real Rho account can be shown. The cron route is excluded because it has its own secret.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (checkBasicAuth(request.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Runway", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron/|_next/static|_next/image|favicon.ico).*)"],
};
