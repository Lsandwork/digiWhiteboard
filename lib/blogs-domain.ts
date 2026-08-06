/**
 * Public Fitdog Blog custom-domain routing (blog.ruffops.com).
 * Serves App Router pages under /blog/* while the browser URL stays on the blog subdomain.
 */

export const BLOGS_HOSTNAME = "blog.ruffops.com";
export const BLOGS_PUBLIC_ORIGIN = `https://${BLOGS_HOSTNAME}`;

const RESERVED_PREFIXES = [
  "/api",
  "/admin",
  "/_next",
  "/assets",
  "/blog",
  "/gingr",
  "/lobby",
  "/cast",
  "/cast-tv",
  "/display",
  "/ruffly",
  "/staff-cast",
  "/lobby-cast",
  "/track",
  "/favicon.ico",
  "/robots.txt"
];

export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":", 1)[0];
}

export function isBlogsHostname(host: string | null | undefined): boolean {
  return normalizeHostname(host) === BLOGS_HOSTNAME;
}

function isReservedBlogsPath(pathname: string) {
  return RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Internal rewrite target for blog.ruffops.com → /blog/* routes.
 * Returns null when the host/path should not be rewritten.
 */
export function rewriteBlogsPublicPath(host: string | null | undefined, pathname: string): string | null {
  if (!isBlogsHostname(host)) return null;
  if (isReservedBlogsPath(pathname)) return null;

  if (pathname === "/") return "/blog";
  if (pathname === "/rss.xml") return "/blog/rss.xml";
  if (pathname === "/sitemap.xml") return "/blog/sitemap.xml";
  if (pathname === "/articles" || pathname.startsWith("/articles/")) return `/blog${pathname}`;
  if (pathname === "/category" || pathname.startsWith("/category/")) return `/blog${pathname}`;

  // Article detail pages live at /{slug} on the blog subdomain.
  if (/^\/[^/]+$/.test(pathname)) return `/blog${pathname}`;

  return null;
}

/** Strip /blog prefix for canonical URLs on blog.ruffops.com. */
export function blogsPublicPathFromInternal(pathname: string) {
  if (pathname === "/blog") return "/";
  if (pathname.startsWith("/blog/")) return pathname.slice("/blog".length) || "/";
  return pathname;
}

/**
 * Redirect /blog/* on the blogs host to clean URLs (/articles, /{slug}, etc.).
 */
export function blogsCanonicalRedirectPath(host: string | null | undefined, pathname: string): string | null {
  if (!isBlogsHostname(host)) return null;
  if (pathname !== "/blog" && !pathname.startsWith("/blog/")) return null;
  return blogsPublicPathFromInternal(pathname);
}

/**
 * Redirect legacy /blog/* on other production hosts to blog.ruffops.com.
 */
export function legacyBlogRedirectUrl(
  host: string | null | undefined,
  pathname: string,
  enabled = process.env.BLOG_LEGACY_REDIRECT !== "false"
): string | null {
  if (!enabled) return null;
  if (isBlogsHostname(host)) return null;
  if (pathname !== "/blog" && !pathname.startsWith("/blog/")) return null;
  const normalizedHost = normalizeHostname(host);
  if (!normalizedHost || normalizedHost === "localhost" || normalizedHost.endsWith(".local")) return null;
  const suffix = blogsPublicPathFromInternal(pathname);
  return `${BLOGS_PUBLIC_ORIGIN}${suffix === "/" ? "" : suffix}`;
}
