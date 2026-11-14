import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserAccess } from "@/lib/admin/permissions";
import { getUserAccessMap } from "@/lib/admin/user-access";
import { isDemoIdentity } from "@/lib/demo/policy";
import { listStaffOps, type StaffDirectoryMember, type StaffOpsState } from "@/lib/staff/admin-ops";
import { isEngagementDepartment } from "@/lib/team-engagement/constants";
import { mapDbError } from "@/lib/team-engagement/errors";
import { teamEngagementTier } from "@/lib/team-engagement/permissions";
import type { EngagementEmployee } from "@/lib/team-engagement/types";

export type EngagementDirectory = {
  employees: EngagementEmployee[];
  byId: Map<string, EngagementEmployee>;
};

type UserRow = { id: string; full_name: string | null; email: string; role: string; status: string };

export function buildEngagementDirectory(input: {
  users: UserRow[];
  accessMap: Record<string, UserAccess>;
  staff: Pick<StaffDirectoryMember, "admin_user_id" | "role" | "department" | "status">[];
}): EngagementDirectory {
  const staffByUser = new Map<string, Pick<StaffDirectoryMember, "role" | "department" | "status">>();
  for (const member of input.staff) {
    if (member.admin_user_id && member.status !== "Inactive") staffByUser.set(member.admin_user_id, member);
  }
  const employees: EngagementEmployee[] = [];
  for (const user of input.users) {
    if (isDemoIdentity({ email: user.email })) continue;
    const access = input.accessMap[user.id];
    const staff = staffByUser.get(user.id);
    employees.push({
      userId: user.id,
      name: user.full_name?.trim() || "RuffOps team member",
      email: user.email,
      title: staff?.role?.trim() || null,
      departmentLabel: staff?.department?.trim() || null,
      departments: (access?.departments ?? []).filter(isEngagementDepartment),
      tier: teamEngagementTier(access, user.role),
      legacyRole: user.role,
      active: user.status === "active"
    });
  }
  employees.sort((a, b) => a.name.localeCompare(b.name));
  return { employees, byId: new Map(employees.map((employee) => [employee.userId, employee])) };
}

/** Joins RuffOps logins with their role assignments and staff directory entries. No avatars, phones, or notes. */
export async function loadEngagementDirectory(
  supabase: SupabaseClient,
  loadStaffOps: () => Promise<StaffOpsState> = () => listStaffOps(supabase)
): Promise<EngagementDirectory> {
  const [usersResult, staffOps] = await Promise.all([
    supabase.from("admin_users").select("id, full_name, email, role, status"),
    loadStaffOps().catch(() => null)
  ]);
  if (usersResult.error) throw mapDbError(usersResult.error);
  const users = (usersResult.data ?? []) as UserRow[];
  const accessMap = await getUserAccessMap(supabase, users);
  return buildEngagementDirectory({ users, accessMap, staff: staffOps?.staff_directory ?? [] });
}
