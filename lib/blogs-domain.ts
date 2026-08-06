/**
 * Public Fitdog Blog custom-domain routing.
 * Serves App Router pages under /blog/* while the browser URL stays on the blog host.
 *
 * Primary consumer domain: blog.fitdog.com (leads + members, no account required)
 * Alternate ops domain: blogs.ruffops.com
 */

export const BLOG_FITDOG_HOSTNAME = "blog.fitdog.com";
/** @deprecated Use BLOG_FITDOG_HOSTNAME or BLOG_PUBLIC_HOSTNAMES */
export const BLOGS_HOSTNAME = "blogs.ruffops.com";

export const BLOG_PUBLIC_HOSTNAMES = [BLOG_FITDOG_HOSTNAME, BLOGS_HOSTNAME] as const;

export const BLOG_PRIMARY_PUBLIC_ORIGIN = `https://${BLOG_FITDOG_HOSTNAME}`;
/** @deprecated Use BLOG_PRIMARY_PUBLIC_ORIGIN */
export const BLOGS_PUBLIC_ORIGIN = BLOG_PRIMARY_PUBLIC_ORIGIN;

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

export function isBlogPublicHostname(host: string | null | undefined): boolean {
  const normalized = normalizeHostname(host);
  return BLOG_PUBLIC_HOSTNAMES.includes(normalized as (typeof BLOG_PUBLIC_HOSTNAMES)[number]);
}

/** @deprecated Use isBlogPublicHostname */
export function isBlogsHostname(host: string | null | undefined): boolean {
  return isBlogPublicHostname(host);
}

export function getBlogPrimaryPublicOrigin() {
  const configured = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
    return withProtocol.replace(/\/$/, "");
  }
  return BLOG_PRIMARY_PUBLIC_ORIGIN;
}

function isReservedBlogsPath(pathname: string) {
  return RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Internal rewrite target for blog.fitdog.com / blogs.ruffops.com → /blog/* routes.
 * Returns null when the host/path should not be rewritten.
 */
export function rewriteBlogsPublicPath(host: string | null | undefined, pathname: string): string | null {
  if (!isBlogPublicHostname(host)) return null;
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

/** Strip /blog prefix for canonical URLs on public blog hosts. */
export function blogsPublicPathFromInternal(pathname: string) {
  if (pathname === "/blog") return "/";
  if (pathname.startsWith("/blog/")) return pathname.slice("/blog".length) || "/";
  return pathname;
}

/**
 * Redirect /blog/* on a public blog host to clean URLs (/articles, /{slug}, etc.).
 */
export function blogsCanonicalRedirectPath(host: string | null | undefined, pathname: string): string | null {
  if (!isBlogPublicHostname(host)) return null;
  if (pathname !== "/blog" && !pathname.startsWith("/blog/")) return null;
  return blogsPublicPathFromInternal(pathname);
}

/**
 * Redirect legacy /blog/* on other production hosts to the primary public blog domain.
 */
export function legacyBlogRedirectUrl(
  host: string | null | undefined,
  pathname: string,
  enabled = process.env.BLOG_LEGACY_REDIRECT !== "false"
): string | null {
  if (!enabled) return null;
  if (isBlogPublicHostname(host)) return null;
  if (pathname !== "/blog" && !pathname.startsWith("/blog/")) return null;
  const normalizedHost = normalizeHostname(host);
  if (!normalizedHost || normalizedHost === "localhost" || normalizedHost.endsWith(".local")) return null;
  const suffix = blogsPublicPathFromInternal(pathname);
  const origin = getBlogPrimaryPublicOrigin();
  return `${origin}${suffix === "/" ? "" : suffix}`;
}
