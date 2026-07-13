import { getAdminSessionFromRequest, type AdminSession } from "@/lib/admin/session";
import { hasPermission, isFullAdminLegacyRole, isSuperAdminLegacyRole } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { isMarketingRole } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function getMarketingActor(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) return null;
  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access, supabase };
}

export function canAccessMarketingPanel(session: AdminSession | null, access: Awaited<ReturnType<typeof getUserAccess>> | null) {
  if (!session) return false;
  if (isMarketingRole(session.role)) return true;
  if (isSuperAdminLegacyRole(session.role) || isFullAdminLegacyRole(session.role)) return true;
  return hasPermission(access, "view_marketing_panel");
}

export function canManageMarketing(session: AdminSession | null, access: Awaited<ReturnType<typeof getUserAccess>> | null) {
  if (!session) return false;
  if (isMarketingRole(session.role)) return true;
  if (isSuperAdminLegacyRole(session.role) || isFullAdminLegacyRole(session.role)) return true;
  return hasPermission(access, "manage_marketing_requests");
}

export function canRespondToMarketingRequest(role?: string | null) {
  return (
    role === "daycare" ||
    role === "team_leader" ||
    role === "front_desk_coordinator" ||
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "assistant_manager"
  );
}

export function unauthorizedMarketingResponse(message = "Unauthorized.") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbiddenMarketingResponse(message = "You do not have permission to access Marketing.") {
  return Response.json({ error: message }, { status: 403 });
}
