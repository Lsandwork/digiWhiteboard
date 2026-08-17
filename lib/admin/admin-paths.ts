/**
 * Distinguish the DigiBoard dashboard shell (`/admin`) from standalone admin
 * apps (`/admin/automatic-blog`, `/admin/blog/...`, etc.).
 *
 * Middleware board locks must only apply to the dashboard. Rewriting a
 * standalone app URL to `/admin?tab=my_shift` is what sent Apps tiles to My Shift.
 */

export function isAdminDashboardPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/admin";
}

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

/** Authenticated app routes under /admin that are not the dashboard shell. */
export function isStandaloneAdminAppPath(pathname: string): boolean {
  if (isAdminDashboardPath(pathname) || isAdminLoginPath(pathname)) return false;
  return pathname.startsWith("/admin/");
}
