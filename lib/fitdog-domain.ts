/**
 * Fitdog staff DigiBoard custom-domain routing (fitdog.ruffops.com).
 *
 * This host is the staff login + DigiBoard entry point. Root `/` redirects to
 * admin login. Authenticated `/admin` traffic is forced onto the staff board so
 * Route Generator / Operations panels are never hidden behind the lobby board.
 */

export const FITDOG_HOSTNAME = "fitdog.ruffops.com";
export const FITDOG_LOGIN_REDIRECT_PATH = "/admin/login?next=%2Fadmin%3Fboard%3Dstaff%26tab%3Dcrossover_communication";

/** Lowercase a Host header / hostname and strip any dev port (e.g. ":3000"). */
export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":", 1)[0];
}

export function isFitdogHostname(host: string | null | undefined): boolean {
  const hostname = normalizeHostname(host);
  return hostname === FITDOG_HOSTNAME || hostname === `www.${FITDOG_HOSTNAME}`;
}

/**
 * True only for fitdog.ruffops.com requesting the site root.
 * Only "/" redirects — /admin/login, /api/*, and other routes stay intact.
 */
export function shouldRedirectFitdogRootToLogin(
  host: string | null | undefined,
  pathname: string
): boolean {
  if (pathname !== "/") return false;
  return isFitdogHostname(host);
}

/**
 * On fitdog.ruffops.com, DigiBoard defaults to the staff board so Route Generator
 * and Operations panels are not hidden behind the lobby board.
 *
 * Only applies when no board was chosen. Forcing an explicitly chosen board back
 * to staff fights the role-based board redirects (a marketing account bounces
 * staff -> marketing -> staff forever, which the browser reports as too many
 * redirects) and makes the board switcher impossible to use on this host.
 */
export function shouldForceFitdogStaffBoard(
  host: string | null | undefined,
  pathname: string,
  board: string | null
): boolean {
  if (!isFitdogHostname(host)) return false;
  if (!(pathname === "/admin" || pathname.startsWith("/admin/"))) return false;
  if (pathname.startsWith("/admin/login")) return false;
  return !board || !board.trim();
}
