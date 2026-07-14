import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canManageCastTv } from "@/lib/cast-tv/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function castTvActorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : session?.role || session?.email
      ? await getUserAccess(supabase, null, session.role, session.email)
      : null;
  return { session, access, supabase };
}

/** Authenticated CAST-TV manager (admin or marketing). Does not require adminUserId on the session. */
export async function resolveCastTvManager(request: Request) {
  if (!isAdminRequest(request)) return null;

  const { session, access, supabase } = await castTvActorAccess(request);
  if (!canManageCastTv(access, session?.role)) return null;

  return { session, access, supabase };
}

export async function requireCastTvManager(request: Request) {
  const manager = await resolveCastTvManager(request);
  if (!manager) {
    if (!isAdminRequest(request)) {
      return { error: unauthorizedAdminResponse() };
    }
    return {
      error: Response.json({ error: "You do not have permission to manage CAST-TV." }, { status: 403 })
    };
  }

  return manager;
}
