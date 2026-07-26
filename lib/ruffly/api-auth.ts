import { isAdminRequest, unauthorizedAdminResponse, getEffectiveAdminRole } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { hasPermission, type PermissionKey } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { isRufflyEnabled } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function requireRufflyPermission(request: Request, permission: PermissionKey) {
  if (!isAdminRequest(request)) {
    return { ok: false as const, response: unauthorizedAdminResponse() };
  }

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);

  if (!isRufflyEnabled() && role !== "owner_admin") {
    return {
      ok: false as const,
      response: Response.json({ error: "Ruffly is disabled. Set RUFFLY_ENABLED=true for Super Admin rollout." }, { status: 403 })
    };
  }

  if (role === "owner_admin") {
    return { ok: true as const, session, role, access: null };
  }

  if (!session?.adminUserId) {
    // Password-header owner path already handled above when role is owner_admin.
    return {
      ok: false as const,
      response: Response.json({ error: "Ruffly requires a signed-in staff user." }, { status: 403 })
    };
  }

  const supabase = getServiceSupabase();
  const access = await getUserAccess(supabase, session.adminUserId, role, session.email);
  if (!hasPermission(access, "ruffly.view") || !hasPermission(access, permission)) {
    return {
      ok: false as const,
      response: Response.json({ error: "You do not have permission for this Ruffly action." }, { status: 403 })
    };
  }

  return { ok: true as const, session, role, access };
}
