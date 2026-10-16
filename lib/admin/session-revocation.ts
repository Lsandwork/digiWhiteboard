/**
 * In-process denylist for admin sessions after disable / password reset.
 * Complements cookie TTL and /api/admin/session status checks. Not a cross-instance
 * store — other serverless instances clear sessions on their next DB-backed session poll.
 */

const revokedUntil = new Map<string, number>();
const MAX_KEYS = 5_000;

export function revokeAdminSessionsForUser(adminUserId: string, untilMs = Date.now() + 12 * 60 * 60_000) {
  const id = adminUserId.trim();
  if (!id) return;
  if (revokedUntil.size >= MAX_KEYS && !revokedUntil.has(id)) {
    const oldest = revokedUntil.keys().next().value;
    if (oldest) revokedUntil.delete(oldest);
  }
  revokedUntil.set(id, untilMs);
}

export function clearAdminSessionRevocation(adminUserId: string) {
  revokedUntil.delete(adminUserId.trim());
}

export function isAdminSessionRevoked(adminUserId: string | null | undefined, now = Date.now()) {
  if (!adminUserId) return false;
  const until = revokedUntil.get(adminUserId.trim());
  if (until == null) return false;
  if (until <= now) {
    revokedUntil.delete(adminUserId.trim());
    return false;
  }
  return true;
}

export function resetAdminSessionRevocationForTests() {
  revokedUntil.clear();
}
