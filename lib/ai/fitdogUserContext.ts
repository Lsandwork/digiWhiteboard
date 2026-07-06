import { accessFromLegacyRole, ROLE_LABELS, type UserAccess } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { listStaffOps } from "@/lib/staff/admin-ops";
import { countUnreadNotifications } from "@/lib/staff/notifications";
import {
  listGroomerSubmissionsForCreator,
  listTrainerSubmissionsForCreator,
  listWriteUpsForCreator
} from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { AdminSession } from "@/lib/admin/session";

export type FitdogUserContext = {
  userId: string | null;
  userName: string;
  userRole: string;
  userRoleLabel: string;
  department: string;
  currentPage: string;
  access: UserAccess;
  allowedActions: string[];
  recentSubmissionCounts: {
    complaints: number;
    requests: number;
    writeUps: number;
  };
  unreadNotificationCount: number;
};

export async function buildFitdogUserContext(params: {
  session: AdminSession;
  currentPage?: string | null;
}): Promise<FitdogUserContext> {
  const supabase = getServiceSupabase();
  const access = params.session.adminUserId
    ? await getUserAccess(supabase, params.session.adminUserId, params.session.role, params.session.email)
    : accessFromLegacyRole(params.session.adminUserId ?? null, params.session.email ?? null, params.session.role);

  const userName = params.session.email?.split("@")[0] ?? "team member";
  const department = access.departments.map((dept) => dept.replace(/_/g, " ")).join(", ");

  let unreadNotificationCount = 0;
  try {
    const staffOps = await listStaffOps(supabase);
    unreadNotificationCount = countUnreadNotifications(staffOps, {
      email: params.session.email,
      adminUserId: params.session.adminUserId,
      role: params.session.role
    });
  } catch (error) {
    console.error("[fitdog-ai] Failed to load notification count:", error);
  }

  const actor = params.session.email ?? params.session.adminUserId ?? "admin";
  let complaints = 0;
  let requests = 0;
  let writeUps = 0;
  try {
    const [groomerComplaints, groomerRequests, trainerComplaints, trainerRequests, writeUpReports] = await Promise.all([
      listGroomerSubmissionsForCreator(supabase, actor, "groomer_complaint", 100).catch(() => []),
      listGroomerSubmissionsForCreator(supabase, actor, "groomer_request", 100).catch(() => []),
      listTrainerSubmissionsForCreator(supabase, actor, "trainer_complaint", 100).catch(() => []),
      listTrainerSubmissionsForCreator(supabase, actor, "trainer_request", 100).catch(() => []),
      listWriteUpsForCreator(supabase, actor, 100).catch(() => [])
    ]);
    complaints = groomerComplaints.length + trainerComplaints.length;
    requests = groomerRequests.length + trainerRequests.length;
    writeUps = writeUpReports.length;
  } catch (error) {
    console.error("[fitdog-ai] Failed to load submission counts:", error);
  }

  return {
    userId: params.session.adminUserId ?? null,
    userName,
    userRole: access.primaryRole,
    userRoleLabel: ROLE_LABELS[access.primaryRole] ?? access.displayLabel,
    department,
    currentPage: params.currentPage?.trim() || "/admin",
    access,
    allowedActions: access.permissions,
    recentSubmissionCounts: { complaints, requests, writeUps },
    unreadNotificationCount
  };
}
