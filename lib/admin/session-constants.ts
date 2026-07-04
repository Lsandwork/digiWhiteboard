export const ADMIN_SESSION_COOKIE = "fitdog_admin_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "fitdog-dev-session-secret-change-me"
  );
}
