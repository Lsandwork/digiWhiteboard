import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session-constants";
import { verifyAdminSessionTokenEdge } from "@/lib/admin/session-edge";
import {
  firstAccessibleAdminTab,
  isAdminOrManagementLegacyRole,
  isFullAdminLegacyRole,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole
} from "@/lib/admin/permissions";
import { LOBBY_REWRITE_TARGET, shouldRewriteLobbyRoot } from "@/lib/lobby-domain";
import { CAST_TV_REWRITE_TARGET, shouldRewriteCastTvRoot } from "@/lib/cast-tv-domain";
import {
  FITDOG_LOGIN_REDIRECT_PATH,
  shouldRedirectFitdogRootToLogin
} from "@/lib/fitdog-domain";
import { RUFFLY_REWRITE_TARGET, rewriteRufflyPublicPath, shouldRewriteRufflyRoot } from "@/lib/ruffly-domain";
import {
  blogsCanonicalRedirectPath,
  legacyBlogRedirectUrl,
  rewriteBlogsPublicPath
} from "@/lib/blogs-domain";

export async function middleware(request: NextRequest) {
  try {
    return await runMiddleware(request);
  } catch {
    // Never 500 the whole app on session/decode errors. For staff-only surfaces,
    // fail closed to login instead of silently serving protected pages.
    const { pathname } = request.nextUrl;
    const isPublicRuffly =
      pathname.startsWith("/ruffly/public") ||
      pathname.startsWith("/ruffly/review") ||
      pathname.startsWith("/ruffly/feedback") ||
      pathname.startsWith("/ruffly/consent") ||
      pathname.startsWith("/ruffly/campaign") ||
      pathname === "/ruffly/widget.js";
    if (
      (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) ||
      pathname.startsWith("/gingr") ||
      (pathname.startsWith("/ruffly") && !isPublicRuffly)
    ) {
      const login = request.nextUrl.clone();
      login.pathname = "/admin/login";
      login.search = "";
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }
}

async function runMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");

  const legacyBlogRedirect = legacyBlogRedirectUrl(host, pathname);
  if (legacyBlogRedirect) {
    return NextResponse.redirect(legacyBlogRedirect, 308);
  }

  const blogsCanonical = blogsCanonicalRedirectPath(host, pathname);
  if (blogsCanonical) {
    return NextResponse.redirect(new URL(blogsCanonical, request.url), 308);
  }

  const blogsRewrite = rewriteBlogsPublicPath(host, pathname);
  if (blogsRewrite) {
    const url = request.nextUrl.clone();
    url.pathname = blogsRewrite;
    return NextResponse.rewrite(url);
  }

  // Staff login shortcut (fitdog.ruffops.com/) → admin login.
  // Does not change staff.ruffops.com landing page behavior.
  if (shouldRedirectFitdogRootToLogin(request.headers.get("host"), pathname)) {
    return NextResponse.redirect(new URL(FITDOG_LOGIN_REDIRECT_PATH, request.url));
  }

  // Lobby custom domain (lobby.ruffops.com/) → serve the Lobby Digital Whiteboard
  // via an internal rewrite. The browser URL stays on lobby.ruffops.com and the
  // Staff board is never rendered on this subdomain. Only "/" is rewritten, so
  // /lobby/checkouts, /api/*, /_next/*, and static assets are untouched.
  if (shouldRewriteLobbyRoot(request.headers.get("host"), pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOBBY_REWRITE_TARGET;
    return NextResponse.rewrite(url);
  }

  // CAST-TV custom domain (casttv.ruffops.com/) → serve the slideshow via an
  // internal rewrite. The browser URL stays on casttv.ruffops.com. Only "/" is
  // rewritten, so /cast-tv, /api/*, /_next/*, and static assets are untouched.
  if (shouldRewriteCastTvRoot(request.headers.get("host"), pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = CAST_TV_REWRITE_TARGET;
    return NextResponse.rewrite(url);
  }

  // Public Ruffly domain (ruffly.ruffops.com/) → public landing / widget host.
  // Staff Ruffly remains on staff.ruffops.com/ruffly with admin session cookies.
  if (shouldRewriteRufflyRoot(request.headers.get("host"), pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = RUFFLY_REWRITE_TARGET;
    return NextResponse.rewrite(url);
  }
  {
    const rufflyPath = rewriteRufflyPublicPath(request.headers.get("host"), pathname);
    if (rufflyPath) {
      const url = request.nextUrl.clone();
      url.pathname = rufflyPath;
      return NextResponse.rewrite(url);
    }
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionTokenEdge(token);

  if (pathname.startsWith("/admin/login")) {
    if (session && !session.mustChangePassword) {
      const role = session.role ?? "";
      if (session.isDemo) {
        return NextResponse.redirect(new URL("/admin?board=staff&tab=demo_push", request.url));
      }
      if (isStaffDigiBoardOnlyLegacyRole(role)) {
        const tab = firstAccessibleAdminTab(null, role, "staff");
        return NextResponse.redirect(new URL(`/admin?board=staff&tab=${tab}`, request.url));
      }
      return NextResponse.redirect(new URL("/admin", request.url));
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

    const role = session.role ?? "";

    // Bare /admin (or staff board with no tab) → Front Desk Log for every account.
    if (pathname === "/admin") {
      const url = request.nextUrl.clone();
      const board = url.searchParams.get("board");
      const tab = url.searchParams.get("tab");
      if (!tab && board !== "marketing" && board !== "lobby") {
        url.searchParams.set("board", "staff");
        url.searchParams.set("tab", "crossover_communication");
        return NextResponse.redirect(url);
      }
      if (!tab && board === "staff") {
        url.searchParams.set("tab", "crossover_communication");
        return NextResponse.redirect(url);
      }
    }

    if (!session.isDemo && isStaffDigiBoardOnlyLegacyRole(role)) {
      const url = request.nextUrl.clone();
      const board = url.searchParams.get("board");
      const tab = url.searchParams.get("tab");
      if (board !== "staff" || !tab) {
        url.pathname = "/admin";
        url.searchParams.set("board", "staff");
        if (!tab) {
          url.searchParams.set("tab", firstAccessibleAdminTab(null, role, "staff"));
        }
        return NextResponse.redirect(url);
      }
    }

    if (!session.isDemo && isLobbyDigiBoardOnlyLegacyRole(role)) {
      const url = request.nextUrl.clone();
      const board = url.searchParams.get("board");
      const tab = url.searchParams.get("tab");
      // Marketing accounts may use Front Desk Log and Bulk Photo Upload on the staff board.
      if (
        board === "staff" &&
        (tab === "crossover_communication" || tab === "bulk_photo_upload" || tab === "help" || !tab)
      ) {
        if (!tab) {
          url.pathname = "/admin";
          url.searchParams.set("board", "staff");
          url.searchParams.set("tab", "crossover_communication");
          return NextResponse.redirect(url);
        }
        return NextResponse.next();
      }
      if (board === "staff") {
        url.pathname = "/admin";
        url.searchParams.set("board", "marketing");
        if (!url.searchParams.get("tab")) {
          url.searchParams.set("tab", "cast_tv");
        }
        return NextResponse.redirect(url);
      }
      if (board !== "lobby" && board !== "marketing") {
        url.pathname = "/admin";
        url.searchParams.set("board", "lobby");
        if (!url.searchParams.get("tab")) {
          url.searchParams.set("tab", firstAccessibleAdminTab(null, role, "lobby"));
        }
        return NextResponse.redirect(url);
      }
    }

    const adminSupportPaths = [
      "/admin/management-support",
      "/admin/trainer-entries",
      "/admin/package-commissions"
    ];
    const isAdminSupportRoute = adminSupportPaths.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    if (isAdminSupportRoute) {
      const canAccessReviewRoutes =
        isFullAdminLegacyRole(role) || isAdminOrManagementLegacyRole(role);
      const canAccessWriteUpSubmitRoute =
        role === "team_leader" && pathname === "/admin/management-support";
      if (!canAccessReviewRoutes && !canAccessWriteUpSubmitRoute) {
        return NextResponse.redirect(new URL("/admin?board=staff", request.url));
      }
    }
  }

  if (pathname === "/gingr" || pathname.startsWith("/gingr/")) {
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
  }

  // Staff Ruffly workspace (not public /ruffly/public* surfaces).
  if (
    (pathname === "/ruffly" || pathname.startsWith("/ruffly/")) &&
    !pathname.startsWith("/ruffly/public") &&
    !pathname.startsWith("/ruffly/review") &&
    !pathname.startsWith("/ruffly/feedback") &&
    !pathname.startsWith("/ruffly/consent") &&
    !pathname.startsWith("/ruffly/campaign") &&
    pathname !== "/ruffly/widget.js"
  ) {
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
  }

  return NextResponse.next();
}

export const config = {
  // "/" is matched so lobby, CAST-TV, Ruffly, and Blogs custom-domain rewrites can run at the root.
  // Non-custom hosts fall through to the normal Staff board at "/".
  matcher: [
    "/",
    "/blog",
    "/blog/:path*",
    "/articles",
    "/articles/:path*",
    "/category/:path*",
    "/rss.xml",
    "/sitemap.xml",
    "/:slug",
    "/admin",
    "/admin/:path*",
    "/gingr",
    "/ruffly",
    "/ruffly/:path*"
  ]
};
