import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";
import { getServiceSupabase, SERVICE_SUPABASE_TIMEOUT_MS } from "@/lib/supabase/server";

type SessionLike = {
  adminUserId?: string | null;
  role?: string | null;
  email?: string | null;
} | null;

/**
 * Permission matrix lookup that cannot hang an SSR page or admin route
 * when Supabase REST is slow. Super Admin / role cookies still authorize
 * via the legacy fallback.
 */
export async function resolveSessionAccess(
  session: SessionLike,
  supabase = getServiceSupabase()
) {
  const fallback = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);
  if (!session?.adminUserId) return fallback;
  return withTimeoutFallback(
    getUserAccess(supabase, session.adminUserId, session.role, session.email),
    SERVICE_SUPABASE_TIMEOUT_MS,
    fallback
  );
}
