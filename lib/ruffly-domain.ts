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
