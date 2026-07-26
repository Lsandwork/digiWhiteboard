/**
 * Public Ruffly custom-domain routing (ruffly.ruffops.com).
 * Mirrors lobby/cast-tv host rewrite helpers.
 */

export const RUFFLY_HOSTNAME = "ruffly.ruffops.com";
export const RUFFLY_REWRITE_TARGET = "/ruffly/public";

export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":", 1)[0];
}

export function isRufflyHostname(host: string | null | undefined): boolean {
  return normalizeHostname(host) === RUFFLY_HOSTNAME;
}

/** Rewrite only "/" on the public Ruffly host. */
export function shouldRewriteRufflyRoot(host: string | null | undefined, pathname: string): boolean {
  if (pathname !== "/") return false;
  return isRufflyHostname(host);
}

/**
 * Map short public paths on ruffly.ruffops.com to App Router pages.
 * /review/:token → /ruffly/review/:token
 * /feedback/:token → /ruffly/feedback/:token
 * /widget.js → /ruffly/widget.js
 */
export function rewriteRufflyPublicPath(host: string | null | undefined, pathname: string): string | null {
  if (!isRufflyHostname(host)) return null;
  if (pathname === "/widget.js") return "/ruffly/widget.js";
  if (pathname === "/review" || pathname.startsWith("/review/")) {
    return `/ruffly${pathname}`;
  }
  if (pathname === "/feedback" || pathname.startsWith("/feedback/")) {
    return `/ruffly${pathname}`;
  }
  if (pathname === "/consent" || pathname.startsWith("/consent/")) {
    return `/ruffly${pathname}`;
  }
  if (pathname === "/campaign" || pathname.startsWith("/campaign/")) {
    return `/ruffly${pathname}`;
  }
  return null;
}
