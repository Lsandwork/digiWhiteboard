/**
 * Fitdog staff-login custom-domain routing (fitdog.ruffops.com).
 *
 * This host is a shortcut to the admin login screen so staff do not need to
 * open staff.ruffops.com and click through the public landing page.
 * staff.ruffops.com itself is intentionally unchanged.
 */

export const FITDOG_HOSTNAME = "fitdog.ruffops.com";
export const FITDOG_LOGIN_REDIRECT_PATH = "/admin/login?next=%2Fadmin";

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
