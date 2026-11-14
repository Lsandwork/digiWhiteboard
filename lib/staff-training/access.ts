import type { UserAccess } from "@/lib/admin/permissions";
import { hasPermission } from "@/lib/admin/permissions";
import type { AdminUserRole } from "@/lib/admin/users";
import { isFullAdminRole, isManagementRole } from "@/lib/admin/users";
import { courseForRole } from "@/lib/staff-training/catalog";

export function canAccessStaffTrainingTab(role: AdminUserRole | null, access: UserAccess | null): boolean {
  if (!role) return false;
  if (isFullAdminRole(role) || isManagementRole(role)) return true;
  const course = courseForRole(role);
  if (!course) return false;
  return hasPermission(access, "view_staff_training");
}

export function canViewStaffTrainingReports(role: AdminUserRole | null, access: UserAccess | null): boolean {
  if (!role) return false;
  if (isFullAdminRole(role) || isManagementRole(role)) return true;
  return hasPermission(access, "view_staff_training_reports");
}

export function trainingCourseSlugForLearner(role: AdminUserRole | null): string | null {
  if (!role) return null;
  return courseForRole(role)?.slug ?? null;
}