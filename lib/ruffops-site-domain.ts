/**
 * Public marketing site routing for ruffops.com / www.ruffops.com.
 *
 * The staff DigiBoard remains the default "/" on staff.ruffops.com and every
 * other host. Only the apex marketing hosts are rewritten onto /ruffops-site/*.
 * Staff login, whiteboards, admin, and authenticated apps are never rewritten.
 */

export const RUFFOPS_MARKETING_HOSTNAMES = ["ruffops.com", "www.ruffops.com"] as const;

export const RUFFOPS_SITE_PREFIX = "/ruffops-site";

const STAFF_AND_APP_PREFIXES = [
  "/admin",
  "/api",
  "/_next",
  "/gingr",
  "/ruffly",
  "/lobby",
  "/lobby-cast",
  "/cast",
  "/cast-tv",
  "/display",
  "/boards",
  "/staff-cast",
  "/track",
  "/demo",
  "/assets",
  "/favicon.ico",
  "/manifest.json",
  "/sw-social-moments.js",
  "/ruffops-site"
] as const;

/** Public path (no trailing slash) → path under /ruffops-site. */
export const RUFFOPS_MARKETING_PAGES: Record<string, string> = {
  "/": "/",
  "/services": "/services",
  "/services.html": "/services",
  "/ai-platform": "/ai-platform",
  "/ai-platform.html": "/ai-platform",
  "/attune": "/attune",
  "/attune.html": "/attune",
  "/dog-behavior-ai.html": "/attune",
  "/industries": "/industries",
  "/industries.html": "/industries",
  "/scenarios": "/scenarios",
  "/resources": "/resources",
  "/online-courses.html": "/resources",
  "/online-programs": "/resources",
  "/online-programs.html": "/resources",
  "/about": "/about",
  "/about.html": "/about",
  "/contact": "/contact",
  "/contact.html": "/contact",
  "/privacy": "/privacy",
  "/terms": "/terms",
  "/blog": "/insights",
  "/insights": "/insights",
  "/faq": "/resources"
};

export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":", 1)[0];
}

export function isRuffopsMarketingHostname(host: string | null | undefined): boolean {
  const hostname = normalizeHostname(host);
  return (RUFFOPS_MARKETING_HOSTNAMES as readonly string[]).includes(hostname);
}

export function normalizePublicPathname(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isReservedStaffOrAppPath(pathname: string): boolean {
  const path = pathname || "/";
  return STAFF_AND_APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function ruffopsMarketingRewriteTarget(pathname: string): string {
  const normalized = normalizePublicPathname(pathname);
  const mapped = RUFFOPS_MARKETING_PAGES[normalized];
  if (!mapped) return "";
  if (mapped === "/") return RUFFOPS_SITE_PREFIX;
  return `${RUFFOPS_SITE_PREFIX}${mapped}`;
}

/**
 * Rewrite public marketing URLs on ruffops.com onto the isolated App Router
 * tree. Returns null when this host/path must fall through (staff, APIs, etc.).
 */
export function rewriteRuffopsMarketingPath(
  host: string | null | undefined,
  pathname: string
): string | null {
  if (!isRuffopsMarketingHostname(host)) return null;
  if (pathname === "/send.php") return "/api/ruffops-site/send";
  if (isReservedStaffOrAppPath(pathname)) return null;
  const target = ruffopsMarketingRewriteTarget(pathname);
  return target || null;
}
