import type { AdminUserRole, AdminUserRecord } from "@/lib/admin/users";
import {
  changeAdminUserPassword,
  createAdminUser,
  deleteAdminUserByEmail,
  findAdminUserByEmail,
  getAdminUserById,
  isAdminUserUuid,
  normalizeAdminUserId,
  updateAdminUser
} from "@/lib/admin/users";
import { loadAdminSettings } from "@/lib/admin/settings";
import { validatePasswordStrength } from "@/lib/admin/password";
import { syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type StaffDirectoryLoginSyncInput = {
  name: string;
  email: string | null;
  admin_user_id?: string | null;
  dashboard_role?: AdminUserRole | null;
  department?: string | null;
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
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "marketing",
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

/** Prefer the account that already owns this email over a stale staff-directory link. */
export async function resolveLinkedAdminUser(
  supabase: SupabaseClient,
  input: Pick<StaffDirectoryLoginSyncInput, "email" | "admin_user_id">
): Promise<AdminUserRecord | null> {
  const email = normalizeEmail(input.email);
  const userByEmail = email ? await findAdminUserByEmail(supabase, email) : null;
  if (userByEmail) return userByEmail;

  if (input.admin_user_id && isAdminUserUuid(input.admin_user_id)) {
    return getAdminUserById(supabase, input.admin_user_id);
  }

  return null;
}

async function applyTempPasswordToLinkedUser(
  supabase: SupabaseClient,
  linkedUser: AdminUserRecord,
  input: { name: string; email: string; role: AdminUserRole; tempPassword: string }
) {
  const patch: Partial<Pick<AdminUserRecord, "full_name" | "email" | "role" | "status">> = {
    full_name: input.name.trim(),
    role: input.role,
    status: "active"
  };

  if (normalizeEmail(linkedUser.email) !== input.email) {
    patch.email = input.email;
  }

  await updateAdminUser(supabase, linkedUser.id, patch);
  await changeAdminUserPassword(supabase, linkedUser.id, input.tempPassword, true);
}

async function finalizeDirectoryLoginSync(
  supabase: SupabaseClient,
  result: StaffDirectoryLoginSyncResult,
  department?: string | null
): Promise<StaffDirectoryLoginSyncResult> {
  if (result.admin_user_id && result.dashboard_role) {
    await syncUserAccessFromLegacyRole(
      supabase,
      result.admin_user_id,
      result.dashboard_role,
      department
    );
  }
  return result;
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

  const linkedUser = await resolveLinkedAdminUser(supabase, input);
  let result: StaffDirectoryLoginSyncResult;

  if (hasTempPassword && email) {
    if (linkedUser) {
      // Reclaim orphaned login left behind after a prior staff-directory delete.
      await applyTempPasswordToLinkedUser(supabase, linkedUser, {
        name: input.name,
        email,
        role,
        tempPassword
      });
      result = { admin_user_id: linkedUser.id, dashboard_role: role };
    } else {
      try {
        const user = await createAdminUser(supabase, {
          full_name: input.name.trim(),
          email,
          password: tempPassword,
          role,
          force_password_change: true,
          created_by: normalizeAdminUserId(createdByAdminId)
        });
        result = { admin_user_id: user.id, dashboard_role: role };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!(message.includes("already in use") || /duplicate|unique/i.test(message))) {
          throw error;
        }

        const existing = await findAdminUserByEmail(supabase, email);
        if (existing) {
          await applyTempPasswordToLinkedUser(supabase, existing, {
            name: input.name,
            email,
            role,
            tempPassword
          });
          result = { admin_user_id: existing.id, dashboard_role: role };
        } else {
          // Clear a leftover fallback/ghost login so the email can be used again.
          await deleteAdminUserByEmail(supabase, email);
          const user = await createAdminUser(supabase, {
            full_name: input.name.trim(),
            email,
            password: tempPassword,
            role,
            force_password_change: true,
            created_by: normalizeAdminUserId(createdByAdminId)
          });
          result = { admin_user_id: user.id, dashboard_role: role };
        }
      }
    }
  } else if (linkedUser && email) {
    const patch: Partial<Pick<AdminUserRecord, "full_name" | "email" | "role">> = {
      full_name: input.name.trim(),
      role
    };
    if (normalizeEmail(linkedUser.email) !== email) {
      patch.email = email;
    }
    await updateAdminUser(supabase, linkedUser.id, patch);
    result = { admin_user_id: linkedUser.id, dashboard_role: role };
  } else {
    result = {
      admin_user_id: linkedUser?.id ?? (isAdminUserUuid(input.admin_user_id) ? input.admin_user_id! : null),
      dashboard_role: linkedUser ? role : input.dashboard_role ?? null
    };
  }

  return finalizeDirectoryLoginSync(supabase, result, input.department);
}
