import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session-constants";
import { verifyAdminSessionTokenEdge } from "@/lib/admin/session-edge";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionTokenEdge(token);

  if (pathname.startsWith("/admin/login")) {
    if (session && !session.mustChangePassword) {
      const dest = session.isDemo ? "/admin?board=staff&tab=demo_push" : "/admin";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!session) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (session.mustChangePassword) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const adminSupportPaths = [
      "/admin/management-support",
      "/admin/trainer-entries",
      "/admin/package-commissions"
    ];
    const isAdminSupportRoute = adminSupportPaths.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    const role = session.role ?? "";
    const isFullAdmin = role === "owner_admin" || role === "manager_admin";
    if (isAdminSupportRoute && !isFullAdmin) {
      return NextResponse.redirect(new URL("/admin?board=staff", request.url));
    }

    if (pathname.startsWith("/admin/settings/user-groups-permissions") && role !== "owner_admin") {
      return NextResponse.redirect(new URL("/admin?tab=settings", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"]
};
