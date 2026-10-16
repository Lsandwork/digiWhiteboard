/**
 * Demo login policy. Edge-safe: no imports, used by both Node and middleware session verification.
 *
 * Demo logins are OFF unless the server sets RUFFOPS_DEMO_MODE=enabled. Never a NEXT_PUBLIC_ variable —
 * the client must not be able to turn demo access on.
 */
export function isDemoModeEnabled() {
  return process.env.RUFFOPS_DEMO_MODE?.trim().toLowerCase() === "enabled";
}

export function isDemoIdentity(input: { isDemo?: boolean | null; email?: string | null } | null | undefined) {
  if (!input) return false;
  if (input.isDemo === true) return true;
  return String(input.email ?? "").trim().toLowerCase().endsWith("@demo.com");
}

/** Demo sessions may only write to the demo sandbox (and sign out). */
const DEMO_WRITE_ALLOWED_PREFIXES = ["/api/demo/", "/api/admin/logout", "/api/admin/session"];

/** Real customer, staff, HR, and account data are never readable by demo sessions, even when demo mode is on. */
const DEMO_READ_DENIED_PREFIXES = [
  "/api/admin/users",
  "/api/admin/user-groups-permissions",
  "/api/admin/logs",
  "/api/admin/hr",
  "/api/admin/hr-consult",
  "/api/admin/write-ups",
  "/api/admin/management-support",
  "/api/admin/management-support-hub",
  "/api/admin/staff-operations",
  "/api/admin/system-health",
  "/api/admin/settings",
  "/api/admin/package-commissions",
  "/api/admin/sms-cost",
  "/api/admin/vip-auto-book",
  "/api/admin/route-generator",
  "/api/admin/gingr-route-generator",
  "/api/admin/live-fleet",
  "/api/admin/impersonate",
  "/api/ruffly/",
  "/api/fitdog-ai/",
  "/api/internal/"
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isDemoRequestAllowed(method: string, pathname: string) {
  if (!isDemoModeEnabled()) return false;
  const verb = method.trim().toUpperCase();
  if (matchesPrefix(pathname, DEMO_WRITE_ALLOWED_PREFIXES)) return true;
  if (!SAFE_METHODS.has(verb)) return false;
  if (pathname.startsWith("/api/ruffly/public")) return true;
  return !matchesPrefix(pathname, DEMO_READ_DENIED_PREFIXES);
}
