import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { type UserAccess } from "@/lib/admin/permissions";
import { canManageCastTv } from "@/lib/cast-tv/permissions";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";
import { getServiceSupabase } from "@/lib/supabase/server";

export type CastTvManager = {
  session: ReturnType<typeof getAdminSessionFromRequest>;
  access: UserAccess | null;
  supabase: ReturnType<typeof getServiceSupabase>;
};

export async function castTvActorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getCastTvSupabase();
  const role = getEffectiveAdminRole(request);

  if (canManageCastTv(null, role)) {
    return { session, access: null as UserAccess | null, supabase };
  }

  try {
    const access = session?.adminUserId
      ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
      : session?.role || session?.email
        ? await getUserAccess(supabase, null, session.role, session.email)
        : null;
    return { session, access, supabase };
  } catch {
    return { session, access: null as UserAccess | null, supabase };
  }
}

/** Authenticated CAST-TV manager (admin or marketing). Does not require adminUserId on the session. */
export async function resolveCastTvManager(request: Request): Promise<CastTvManager | null> {
  if (!isAdminRequest(request)) return null;

  const { session, access, supabase } = await castTvActorAccess(request);
  const role = getEffectiveAdminRole(request);
  if (!canManageCastTv(access, role)) return null;

  return { session, access, supabase };
}

export async function requireCastTvManager(request: Request) {
  try {
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
  } catch (error) {
    const message = castTvErrorMessage(error, "Unable to authorize CAST-TV.");
    return { error: Response.json({ error: message }, { status: 500 }) };
  }
}
