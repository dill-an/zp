import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "zp_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Cheap gate: redirect to /login when no session cookie exists.
 * Real validation happens in server components via getCurrentUser().
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico)).*)"],
};
