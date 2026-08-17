import { isAdminRequest, unauthorizedAdminResponse, getEffectiveAdminRole } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole, canAccessBlogGenerator, hasPermission, type PermissionKey } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { isBlogEnabled } from "@/lib/blog/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function requireBlogPermission(request: Request, permission: PermissionKey) {
  if (!isAdminRequest(request)) {
    return { ok: false as const, response: unauthorizedAdminResponse() };
  }

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);

  if (!isBlogEnabled() && role !== "owner_admin") {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Blog Generator is disabled. Set BLOG_ENABLED=true to enable for staff." },
        { status: 403 }
      )
    };
  }

  if (role === "owner_admin") {
    return { ok: true as const, session, role, access: null as null };
  }

  if (!session?.adminUserId) {
    return {
      ok: false as const,
      response: Response.json({ error: "Blog Generator requires a signed-in staff user." }, { status: 403 })
    };
  }

  const supabase = getServiceSupabase();
  const access = await getUserAccess(supabase, session.adminUserId, role, session.email);
  if (!canAccessBlogGenerator(access, role, session.email)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Blog Generator is limited to Super Admin, Admin, and Marketing." },
        { status: 403 }
      )
    };
  }
  const roleDefaults = accessFromLegacyRole(session.adminUserId, session.email, role);
  if (
    (!hasPermission(access, "blog.view") && !hasPermission(roleDefaults, "blog.view")) ||
    (!hasPermission(access, permission) && !hasPermission(roleDefaults, permission))
  ) {
    return {
      ok: false as const,
      response: Response.json({ error: "You do not have permission for this Blog Generator action." }, { status: 403 })
    };
  }

  return { ok: true as const, session, role, access };
}

export function blogActor(session: { email?: string | null } | null | undefined, role?: string | null) {
  return session?.email || role || "staff";
}
