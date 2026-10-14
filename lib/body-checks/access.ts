import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessAdminTab, accessFromLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function requireBodyCheckAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse(), session: null, actor: null, supabase: null };
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      session: null,
      actor: null,
      supabase: null
    };
  }
  const access = accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  if (!canAccessAdminTab(access, "body_checks", session.role, "staff")) {
    return {
      error: NextResponse.json({ error: "You do not have access to Body Checks." }, { status: 403 }),
      session: null,
      actor: null,
      supabase: null
    };
  }
  const supabase = getServiceSupabase({ timeoutMs: 8_000 });
  let name = session.email;
  const userId = normalizeAdminUserId(session.adminUserId);
  if (userId) {
    const { data } = await supabase.from("admin_users").select("full_name, email").eq("id", userId).maybeSingle();
    const fullName = String(data?.full_name ?? "").trim();
    if (fullName) name = fullName;
  }
  return {
    error: null,
    session,
    actor: { userId, name },
    supabase
  };
}
