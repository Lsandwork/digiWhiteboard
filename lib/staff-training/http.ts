import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { accessFromLegacyRole, canAccessAdminTab } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import type { AdminUserRole } from "@/lib/admin/users";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canViewStaffTrainingReports } from "@/lib/staff-training/access";

export async function requireStaffTrainingAccess(request: Request) {
  if (!isAdminRequest(request)) {
    return { error: unauthorizedAdminResponse(), session: null, adminUserId: null, role: null, supabase: null };
  }
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      session: null,
      adminUserId: null,
      role: null,
      supabase: null
    };
  }
  const role = (session.role ?? null) as AdminUserRole | null;
  const access = accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  if (!canAccessAdminTab(access, "staff_training", session.role, "staff")) {
    return {
      error: NextResponse.json({ error: "You do not have access to Staff Training." }, { status: 403 }),
      session: null,
      adminUserId: null,
      role: null,
      supabase: null
    };
  }
  let supabase;
  try {
    supabase = getServiceSupabase({ timeoutMs: 8_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training progress storage is unavailable.";
    return {
      error: NextResponse.json({ error: message }, { status: 503 }),
      session: null,
      adminUserId: null,
      role: null,
      supabase: null
    };
  }
  const adminUserId = normalizeAdminUserId(session.adminUserId);
  if (!adminUserId) {
    return {
      error: NextResponse.json({ error: "Staff account id is missing." }, { status: 400 }),
      session: null,
      adminUserId: null,
      role: null,
      supabase: null
    };
  }
  return {
    error: null,
    session,
    adminUserId,
    role,
    access,
    canViewReports: canViewStaffTrainingReports(role, access),
    supabase
  };
}