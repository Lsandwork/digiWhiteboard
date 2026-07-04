import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "fitdog_admin_session";

function hasSessionCookie(token: string | undefined) {
  return Boolean(token && token.includes(".") && token.length > 20);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (pathname.startsWith("/admin/login")) {
    if (hasSessionCookie(token)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSessionCookie(token)) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"]
};
