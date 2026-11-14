import type { AdminUserRole, AdminUserRecord } from "@/lib/admin/users";
import {
  changeAdminUserPassword,
  createAdminUser,
  deleteAdminUserByEmail,
  findAdminUserByEmail,
  getAdminUserById,
  isAdminUserUuid,
  isFullAdminRole,
  normalizeAdminUserId,
  updateAdminUser
} from "@/lib/admin/users";
import { loadAdminSettings } from "@/lib/admin/settings";
import { validatePasswordStrength } from "@/lib/admin/password";
import {
  hasAnyRole,
  isSuperAdminAccess,
  isSuperAdminLegacyRole,
  legacyRoleToRoleKey,
  type UserAccess
} from "@/lib/admin/permissions";
import { assertUserMutationAllowed } from "@/lib/admin/super-admin-guards";
import { departmentsForLegacyRole, getUserAccess, syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";
import {
  getAdminUserCreationTier,
  roleAssignmentError,
  sameMembers,
  selfAccessChangeError
} from "@/lib/admin/user-creation-access";

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
  "overnight",
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

export type DirectoryLoginActor = {
  adminUserId: string | null;
  legacyRole: string | null;
  email: string | null;
};

type DirectoryLoginTarget = { user: AdminUserRecord; access: UserAccess };

type DirectoryLoginActorAccess = { id: string | null; legacyRole: string | null; access: UserAccess | null };

async function loadActorAccess(supabase: SupabaseClient, actor: DirectoryLoginActor): Promise<DirectoryLoginActorAccess> {
  const id = normalizeAdminUserId(actor.adminUserId);
  return {
    id,
    legacyRole: actor.legacyRole,
    access: id ? await getUserAccess(supabase, id, actor.legacyRole, actor.email) : null
  };
}

function isAdminTierTarget(target: DirectoryLoginTarget) {
  return isFullAdminRole(target.user.role) || hasAnyRole(target.access, ["super_admin", "admin"]);
}

function actorIsAdminTier(actor: DirectoryLoginActorAccess) {
  const tier = getAdminUserCreationTier(actor.access, actor.legacyRole);
  return tier === "super_admin" || tier === "admin";
}

/**
 * Role, department, login email, and password changes made from the Staff Directory follow the same rules as
 * User Management: only roles the actor may grant, no changing your own role or departments, Super Admin accounts
 * are changed only by Super Admin, and Management can't change an Admin or Super Admin account.
 */
export async function evaluateDirectoryLoginChange(
  supabase: SupabaseClient,
  input: {
    actor: DirectoryLoginActorAccess;
    linked: DirectoryLoginTarget | null;
    email: string | null;
    dashboardRole: AdminUserRole | null | undefined;
    department: string | null | undefined;
    settingPassword: boolean;
  }
): Promise<string | null> {
  const { actor, linked } = input;
  const email = normalizeEmail(input.email);
  const nextRole = normalizeDashboardRole(input.dashboardRole);
  const nextRoleKey = legacyRoleToRoleKey(nextRole);

  if (!linked) {
    if (!input.settingPassword || !email) return null;
    return roleAssignmentError(actor.access, actor.legacyRole, [nextRoleKey], []);
  }

  // A linked login's role assignment is re-synced on every save, with or without an email.
  const roleChanging = nextRole !== linked.user.role || linked.access.primaryRole !== nextRoleKey;
  const emailChanging = Boolean(email) && normalizeEmail(linked.user.email) !== email;
  const nextDepartments = departmentsForLegacyRole(nextRole, input.department);
  const departmentsChanging = !sameMembers(nextDepartments, linked.access.departments);
  if (!roleChanging && !emailChanging && !input.settingPassword && !departmentsChanging) return null;

  const isSelf = Boolean(actor.id && linked.user.id === actor.id);
  const actorIsSuperAdmin = isSuperAdminLegacyRole(actor.legacyRole) || isSuperAdminAccess(actor.access);
  const selfError = selfAccessChangeError({
    isSelf,
    actorIsSuperAdmin,
    current: linked.access,
    nextPrimaryRole: nextRoleKey,
    nextAdditionalRoles: [],
    nextDepartments
  });
  if (selfError) return selfError;

  try {
    await assertUserMutationAllowed({
      supabase,
      actorLegacyRole: actor.legacyRole,
      actorAccess: actor.access,
      targetUserId: linked.user.id,
      targetLegacyRole: linked.user.role,
      targetAccess: linked.access,
      nextPrimaryRole: roleChanging ? nextRoleKey : undefined,
      action: "update"
    });
  } catch (error) {
    return error instanceof Error ? error.message : "That change isn't allowed.";
  }
  if (roleChanging) {
    const roleError = roleAssignmentError(actor.access, actor.legacyRole, [nextRoleKey], linked.access.roles);
    if (roleError) return roleError;
  }
  if (!isSelf && isAdminTierTarget(linked) && !actorIsAdminTier(actor)) {
    return "Management can't change the login, role, or departments of an Admin or Super Admin account.";
  }
  return null;
}

export async function directoryLoginChangeError(
  supabase: SupabaseClient,
  actor: DirectoryLoginActor,
  input: Pick<
    StaffDirectoryLoginSyncInput,
    "email" | "admin_user_id" | "dashboard_role" | "department" | "temp_password" | "confirm_password"
  >
): Promise<string | null> {
  const [actorAccess, linkedUser] = await Promise.all([loadActorAccess(supabase, actor), resolveLinkedAdminUser(supabase, input)]);
  const linked = linkedUser
    ? { user: linkedUser, access: await getUserAccess(supabase, linkedUser.id, linkedUser.role, linkedUser.email) }
    : null;
  return evaluateDirectoryLoginChange(supabase, {
    actor: actorAccess,
    linked,
    email: input.email,
    dashboardRole: input.dashboard_role,
    department: input.department,
    settingPassword: Boolean(String(input.temp_password ?? "").trim() || String(input.confirm_password ?? "").trim())
  });
}

/** Deleting a Staff Directory profile also deletes its login, so it follows the User Management delete rules. */
export async function evaluateDirectoryLoginDelete(
  supabase: SupabaseClient,
  input: { actor: DirectoryLoginActorAccess; targets: DirectoryLoginTarget[] }
): Promise<string | null> {
  const { actor } = input;
  for (const target of input.targets) {
    if (actor.id && target.user.id === actor.id) return "You can't delete your own login. Ask another administrator.";
    try {
      await assertUserMutationAllowed({
        supabase,
        actorLegacyRole: actor.legacyRole,
        actorAccess: actor.access,
        targetUserId: target.user.id,
        targetLegacyRole: target.user.role,
        targetAccess: target.access,
        action: "delete"
      });
    } catch (error) {
      return error instanceof Error ? error.message : "That change isn't allowed.";
    }
    if (isAdminTierTarget(target) && !actorIsAdminTier(actor)) {
      return "Management can't delete the login of an Admin or Super Admin account.";
    }
  }
  return null;
}

export async function directoryLoginDeleteError(
  supabase: SupabaseClient,
  actor: DirectoryLoginActor,
  input: Pick<StaffDirectoryLoginSyncInput, "email" | "admin_user_id">
): Promise<string | null> {
  const email = normalizeEmail(input.email);
  const candidates = await Promise.all([
    email ? findAdminUserByEmail(supabase, email) : Promise.resolve(null),
    input.admin_user_id && isAdminUserUuid(input.admin_user_id)
      ? getAdminUserById(supabase, input.admin_user_id)
      : Promise.resolve(null)
  ]);
  const users = [...new Map(candidates.filter((user): user is AdminUserRecord => Boolean(user)).map((user) => [user.id, user])).values()];
  if (!users.length) return null;
  const [actorAccess, targets] = await Promise.all([
    loadActorAccess(supabase, actor),
    Promise.all(users.map(async (user) => ({ user, access: await getUserAccess(supabase, user.id, user.role, user.email) })))
  ]);
  return evaluateDirectoryLoginDelete(supabase, { actor: actorAccess, targets });
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
