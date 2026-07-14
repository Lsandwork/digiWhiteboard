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
    : null;
  return { session, access, supabase };
}

export async function requireCastTvManager(request: Request) {
  if (!isAdminRequest(request)) {
    return { error: unauthorizedAdminResponse() };
  }

  const { session, access, supabase } = await castTvActorAccess(request);
  if (!canManageCastTv(access, session?.role)) {
    return {
      error: Response.json({ error: "You do not have permission to manage CAST-TV." }, { status: 403 })
    };
  }

  return { session, access, supabase };
}
