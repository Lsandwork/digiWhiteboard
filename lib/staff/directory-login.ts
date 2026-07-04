import type { AdminUserRole } from "@/lib/admin/users";
import {
  changeAdminUserPassword,
  createAdminUser,
  findAdminUserByEmail,
  getAdminUserById,
  isAdminUserUuid,
  normalizeAdminUserId,
  updateAdminUser
} from "@/lib/admin/users";
import { loadAdminSettings } from "@/lib/admin/settings";
import { validatePasswordStrength } from "@/lib/admin/password";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type StaffDirectoryLoginSyncInput = {
  name: string;
  email: string | null;
  admin_user_id?: string | null;
  dashboard_role?: AdminUserRole | null;
  temp_password?: string | null;
  confirm_password?: string | null;
};

export type StaffDirectoryLoginSyncResult = {
  admin_user_id: string | null;
  dashboard_role: AdminUserRole | null;
};

const dashboardRoles: AdminUserRole[] = [
  "owner_admin",
  "manager_admin",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "viewer"
];

function normalizeDashboardRole(value: unknown): AdminUserRole {
  return dashboardRoles.includes(value as AdminUserRole) ? (value as AdminUserRole) : "viewer";
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

async function validateTempPassword(supabase: SupabaseClient, password: string, confirmPassword: string) {
  if (!password) throw new Error("Temporary password is required.");
  if (password !== confirmPassword) throw new Error("Passwords do not match.");

  const settings = await loadAdminSettings(supabase);
  const validation = validatePasswordStrength(password, settings.require_strong_passwords);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
}

export async function syncStaffDirectoryLoginAccount(
  supabase: SupabaseClient,
  input: StaffDirectoryLoginSyncInput,
  createdByAdminId: string | null
): Promise<StaffDirectoryLoginSyncResult> {
  const email = normalizeEmail(input.email);
  const role = normalizeDashboardRole(input.dashboard_role);
  const tempPassword = String(input.temp_password ?? "").trim();
  const confirmPassword = String(input.confirm_password ?? "").trim();
  const hasTempPassword = Boolean(tempPassword || confirmPassword);

  if (hasTempPassword) {
    await validateTempPassword(supabase, tempPassword, confirmPassword);
    if (!email) throw new Error("Email is required before setting a dashboard login password.");
  }

  let linkedUser =
    (input.admin_user_id && isAdminUserUuid(input.admin_user_id) ? await getAdminUserById(supabase, input.admin_user_id) : null) ??
    (email ? await findAdminUserByEmail(supabase, email) : null);

  if (hasTempPassword && email) {
    if (linkedUser) {
      await updateAdminUser(supabase, linkedUser.id, {
        full_name: input.name.trim(),
        email,
        role,
        status: "active"
      });
      await changeAdminUserPassword(supabase, linkedUser.id, tempPassword, true);
      return { admin_user_id: linkedUser.id, dashboard_role: role };
    }

    const user = await createAdminUser(supabase, {
      full_name: input.name.trim(),
      email,
      password: tempPassword,
      role,
      force_password_change: true,
      created_by: normalizeAdminUserId(createdByAdminId)
    });
    return { admin_user_id: user.id, dashboard_role: role };
  }

  if (linkedUser && email) {
    await updateAdminUser(supabase, linkedUser.id, {
      full_name: input.name.trim(),
      email,
      role
    });
    return { admin_user_id: linkedUser.id, dashboard_role: role };
  }

  return {
    admin_user_id: linkedUser?.id ?? (isAdminUserUuid(input.admin_user_id) ? input.admin_user_id! : null),
    dashboard_role: linkedUser ? role : input.dashboard_role ?? null
  };
}
