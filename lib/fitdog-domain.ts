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
  return normalizeHostname(host) === FITDOG_HOSTNAME;
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
 * On fitdog.ruffops.com, keep DigiBoard on the staff board (lobby/marketing boards
 * hide Route Generator + Operations tabs).
 */
export function shouldForceFitdogStaffBoard(
  host: string | null | undefined,
  pathname: string,
  board: string | null
): boolean {
  if (!isFitdogHostname(host)) return false;
  if (!(pathname === "/admin" || pathname.startsWith("/admin/"))) return false;
  if (pathname.startsWith("/admin/login")) return false;
  return board !== "staff";
}
