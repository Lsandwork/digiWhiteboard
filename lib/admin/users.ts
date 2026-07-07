import bcrypt from "bcryptjs";
import { canAccessFrontDeskLogForRole, canCreateFrontDeskLogForRole } from "@/lib/admin/permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** admin_users.created_by is a UUID FK — never pass emails or labels like "admin". */
export function isAdminUserUuid(value?: string | null) {
  return Boolean(value && UUID_RE.test(value));
}

export function normalizeAdminUserId(value?: string | null) {
  return isAdminUserUuid(value) ? value! : null;
}

export type AdminUserRole =
  | "owner_admin"
  | "manager_admin"
  | "assistant_manager"
  | "front_desk_coordinator"
  | "team_leader"
  | "groomer"
  | "trainer"
  | "daycare"
  | "viewer";
export type AdminUserStatus = "active" | "disabled";

export const ADMIN_USER_ROLE_LABELS: Record<AdminUserRole, string> = {
  owner_admin: "Owner Admin",
  manager_admin: "Manager Admin",
  assistant_manager: "Assistant Manager",
  front_desk_coordinator: "Front Desk Coordinator",
  team_leader: "Team Lead",
  groomer: "Groomer",
  trainer: "Trainer",
  daycare: "Dog Handler",
  viewer: "Viewer"
};

/** Sidebar user card — uses hyphenated front desk label per staff admin UX. */
export const ADMIN_SIDEBAR_ROLE_LABELS: Record<AdminUserRole, string> = {
  owner_admin: "Super Admin",
  manager_admin: "Admin",
  assistant_manager: "Assistant Manager",
  front_desk_coordinator: "Front Desk - Coordinator",
  team_leader: "Team Lead",
  groomer: "Groomer",
  trainer: "Trainer",
  daycare: "Dog Handler",
  viewer: "Viewer"
};

export function getAdminSidebarRoleLabel(role?: string | null, email?: string | null): string {
  if (role && role in ADMIN_SIDEBAR_ROLE_LABELS) {
    return ADMIN_SIDEBAR_ROLE_LABELS[role as AdminUserRole];
  }
  if (email?.trim().toLowerCase() === "contact@fitdog.com") {
    return ADMIN_SIDEBAR_ROLE_LABELS.front_desk_coordinator;
  }
  return "Admin";
}

export const STAFF_OPS_LIMITED_ROLES: AdminUserRole[] = ["front_desk_coordinator", "team_leader"];
export const CROSSOVER_STAFF_ROLES: AdminUserRole[] = ["groomer", "trainer"];

/** Front Desk Coordinator and Team Leader share the same staff admin access. */
export const COORDINATOR_LIKE_ROLES = STAFF_OPS_LIMITED_ROLES;

export function isStaffOpsLimitedRole(role?: string | null) {
  return role === "front_desk_coordinator" || role === "team_leader";
}

export function isTeamLeaderRole(role?: string | null) {
  return role === "team_leader";
}

export function isFrontDeskCoordinatorRole(role?: string | null) {
  return role === "front_desk_coordinator";
}

export function isCrossoverStaffRole(role?: string | null) {
  return role === "groomer" || role === "trainer";
}

/** Alias: true for Front Desk Coordinator and Team Leader. */
export function hasCoordinatorAccess(role?: string | null) {
  return isStaffOpsLimitedRole(role);
}

/** Front Desk Shift Log — all authenticated dashboard users. */
export function canAccessFrontDeskLog(role?: string | null) {
  return canAccessFrontDeskLogForRole(role);
}

/** Submit new Front Desk log entries — all authenticated dashboard users. */
export function canCreateFrontDeskLog(role?: string | null) {
  return canCreateFrontDeskLogForRole(role);
}

/** Alias: coordinator-like roles share identical staff panel permissions. */
export function isCoordinatorLikeRole(role?: string | null) {
  return hasCoordinatorAccess(role);
}

/** Crossover Communication tab — coordinators, management, admins (legacy tab id). */
export function canAccessCrossoverCommunication(role?: string | null) {
  return canAccessFrontDeskLog(role);
}

/** Crossover row actions (view, resolve, more) for anyone with crossover access. */
export function canUseCrossoverConversationActions(role?: string | null) {
  return canAccessCrossoverCommunication(role);
}

/** Push crossover alerts to the staff whiteboard — coordinators and admins only. */
export function canPushCrossoverToWhiteboard(role?: string | null) {
  return isFullAdminRole(role) || hasCoordinatorAccess(role);
}

/** Push Notices tab — front desk coordinators, team leads, and admins. */
export function canAccessPushNotices(role?: string | null) {
  return isFullAdminRole(role) || hasCoordinatorAccess(role);
}

/** Owner complaint push notice — anyone with Push Notices access. */
export function canCreateDogHandlerComplaintNotice(role?: string | null) {
  return canAccessPushNotices(role);
}

/** Management write-up reports — admin and management only. */
export function canViewManagementReports(role?: string | null) {
  return isFullAdminRole(role);
}

export function isGroomerRole(role?: string | null) {
  return role === "groomer";
}

export function isTrainerRole(role?: string | null) {
  return role === "trainer";
}

/** Team leads can submit employee write-ups for management review. */
export function canSubmitWriteUp(role?: string | null) {
  return role === "team_leader" || role === "daycare";
}

/** Team leads can review status of their own submitted write-ups. */
export function canViewOwnWriteUps(role?: string | null) {
  return role === "team_leader" || role === "daycare";
}

/** Groomers can file complaints for admin and management review. */
export function canSubmitGroomerComplaint(role?: string | null) {
  return role === "groomer" || role === "daycare";
}

/** Groomers can file requests for admin and management review. */
export function canSubmitGroomerRequest(role?: string | null) {
  return role === "groomer" || role === "daycare";
}

/** Groomers can review their own filed complaints and requests. */
export function canViewOwnGroomerSubmissions(role?: string | null) {
  return role === "groomer" || role === "daycare";
}

/** Trainers can file complaints for admin and management review. */
export function canSubmitTrainerComplaint(role?: string | null) {
  return role === "trainer";
}

/** Trainers can file requests for admin and management review. */
export function canSubmitTrainerRequest(role?: string | null) {
  return role === "trainer";
}

/** Trainers can review their own filed complaints and requests. */
export function canViewOwnTrainerSubmissions(role?: string | null) {
  return role === "trainer";
}

/** Trainers can view package commission records. */
export function canViewPackageCommissions(role?: string | null) {
  return role === "trainer" || isFullAdminRole(role);
}

/** Trainers can comment on package commission rows. */
export function canCommentPackageCommissions(role?: string | null) {
  return role === "trainer";
}

/** Trainers can submit trainer shift log entries. */
export function canCreateTrainerEntry(role?: string | null) {
  return role === "trainer" || role === "daycare";
}

/** Admin and management can manage package commission CSV data. */
export function canManagePackageCommissions(role?: string | null) {
  return isFullAdminRole(role);
}

/** Admin and management can review all management support submissions. */
export function canReviewManagementSupport(role?: string | null) {
  return isFullAdminRole(role);
}

export function isStaffPanelLimitedRole(role?: string | null) {
  return isStaffOpsLimitedRole(role) || isCrossoverStaffRole(role);
}

export function isFullAdminRole(role?: string | null) {
  return role === "owner_admin" || role === "manager_admin" || !role;
}

/** View Staff Directory — coordinators and full admins; mutations remain full-admin only. */
export function canViewStaffDirectory(role?: string | null) {
  return isFullAdminRole(role) || hasCoordinatorAccess(role);
}

export function canManageStaffDirectory(role?: string | null) {
  return isFullAdminRole(role);
}

export type AdminUserRecord = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  force_password_change: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type AdminUserPublic = Omit<AdminUserRecord, "password_hash">;

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

type AdminUsersState = {
  users: AdminUserRecord[];
};

const ADMIN_USERS_STATE_ACTION = "admin_users_state";
const ADMIN_USERS_STATE_SOURCE = "admin_users_fallback";

function adminUserErrorMessage(error: { code?: string; message?: string }) {
  const message = error.message ?? "Admin user request failed.";
  if (error.code === "42P01" || error.code === "PGRST205" || message.includes("admin_users")) {
    return "Admin user storage is not available.";
  }
  if (message.includes("duplicate") || error.code === "23505") {
    return "That email is already in use.";
  }
  return message;
}

function throwAdminUserError(error: { code?: string; message?: string }): never {
  throw new Error(adminUserErrorMessage(error));
}

function isMissingAdminUsersTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("admin_users"));
}

function newAdminUserId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `admin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortUsers(users: AdminUserRecord[]) {
  return [...users].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function parseAdminUsersState(value: unknown): AdminUsersState {
  if (!value || typeof value !== "object") return { users: [] };
  const users = Array.isArray((value as { users?: unknown }).users)
    ? ((value as { users: AdminUserRecord[] }).users)
    : [];
  return { users: sortUsers(users) };
}

async function loadFallbackAdminUsersState(supabase: SupabaseClient): Promise<AdminUsersState> {
  const { data, error } = await supabase
    .from("board_activity_log")
    .select("details")
    .eq("action", ADMIN_USERS_STATE_ACTION)
    .eq("source", ADMIN_USERS_STATE_SOURCE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { users: [] };
    throwAdminUserError(error);
  }

  return parseAdminUsersState(data?.details);
}

async function saveFallbackAdminUsersState(supabase: SupabaseClient, state: AdminUsersState) {
  const { error } = await supabase.from("board_activity_log").insert({
    action: ADMIN_USERS_STATE_ACTION,
    source: ADMIN_USERS_STATE_SOURCE,
    details: { users: sortUsers(state.users) }
  });

  if (error) throwAdminUserError(error);
}

export function sanitizeAdminUser(row: AdminUserRecord): AdminUserPublic {
  const { password_hash: _hash, ...rest } = row;
  return rest;
}

export async function findAdminUserByEmail(supabase: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      return state.users.find((user) => user.email === normalized) ?? null;
    }
    throwAdminUserError(error);
  }
  if (data) return data as AdminUserRecord;

  const state = await loadFallbackAdminUsersState(supabase);
  return state.users.find((user) => user.email === normalized) ?? null;
}

export async function listAdminUsers(supabase: SupabaseClient): Promise<AdminUserPublic[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      return state.users.map(sanitizeAdminUser);
    }
    throwAdminUserError(error);
  }
  return (data ?? []) as AdminUserPublic[];
}

export async function getAdminUserById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("admin_users").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      return state.users.find((user) => user.id === id) ?? null;
    }
    throwAdminUserError(error);
  }
  if (data) return data as AdminUserRecord;

  const state = await loadFallbackAdminUsersState(supabase);
  return state.users.find((user) => user.id === id) ?? null;
}

export async function hashAdminPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyAdminUserPassword(user: AdminUserRecord, password: string) {
  return bcrypt.compare(password, user.password_hash);
}

export async function createAdminUser(
  supabase: SupabaseClient,
  input: {
    full_name: string;
    email: string;
    password: string;
    role: AdminUserRole;
    force_password_change?: boolean;
    created_by?: string | null;
  }
) {
  const password_hash = await hashAdminPassword(input.password);
  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      full_name: input.full_name.trim(),
      email: input.email.trim().toLowerCase(),
      password_hash,
      role: input.role,
      force_password_change: input.force_password_change ?? false,
      created_by: normalizeAdminUserId(input.created_by)
    })
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .single();
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      const normalizedEmail = input.email.trim().toLowerCase();
      if (state.users.some((user) => user.email === normalizedEmail)) {
        throw new Error("That email is already in use.");
      }
      const now = new Date().toISOString();
      const user: AdminUserRecord = {
        id: newAdminUserId(),
        full_name: input.full_name.trim(),
        email: normalizedEmail,
        password_hash,
        role: input.role,
        status: "active",
        force_password_change: input.force_password_change ?? false,
        last_login_at: null,
        created_at: now,
        updated_at: now,
        created_by: normalizeAdminUserId(input.created_by)
      };
      await saveFallbackAdminUsersState(supabase, { users: [...state.users, user] });
      return sanitizeAdminUser(user);
    }
    throwAdminUserError(error);
  }
  return data as AdminUserPublic;
}

export async function updateAdminUser(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<AdminUserRecord, "full_name" | "email" | "role" | "status" | "force_password_change">>
) {
  const normalizedPatch = { ...patch };
  if (normalizedPatch.email) {
    const nextEmail = normalizedPatch.email.trim().toLowerCase();
    const conflict = await findAdminUserByEmail(supabase, nextEmail);
    if (conflict && conflict.id !== id) {
      throw new Error("That email is already in use.");
    }
    normalizedPatch.email = nextEmail;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .update({ ...normalizedPatch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .maybeSingle();
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      const existing = state.users.find((user) => user.id === id);
      if (!existing) throw new Error("Admin user not found.");
      const nextEmail = normalizedPatch.email ? normalizedPatch.email.trim().toLowerCase() : existing.email;
      if (state.users.some((user) => user.id !== id && user.email === nextEmail)) {
        throw new Error("That email is already in use.");
      }
      const updated: AdminUserRecord = {
        ...existing,
        ...normalizedPatch,
        email: nextEmail,
        updated_at: new Date().toISOString()
      };
      await saveFallbackAdminUsersState(supabase, {
        users: state.users.map((user) => (user.id === id ? updated : user))
      });
      return sanitizeAdminUser(updated);
    }
    throwAdminUserError(error);
  }

  if (!data) {
    const state = await loadFallbackAdminUsersState(supabase);
    const existing = state.users.find((user) => user.id === id);
    if (!existing) throw new Error("Admin user not found.");
    const nextEmail = normalizedPatch.email ? normalizedPatch.email.trim().toLowerCase() : existing.email;
    if (state.users.some((user) => user.id !== id && user.email === nextEmail)) {
      throw new Error("That email is already in use.");
    }
    const updated: AdminUserRecord = {
      ...existing,
      ...normalizedPatch,
      email: nextEmail,
      updated_at: new Date().toISOString()
    };
    await saveFallbackAdminUsersState(supabase, {
      users: state.users.map((user) => (user.id === id ? updated : user))
    });
    return sanitizeAdminUser(updated);
  }

  return data as AdminUserPublic;
}

export async function changeAdminUserPassword(
  supabase: SupabaseClient,
  id: string,
  password: string,
  forcePasswordChange?: boolean
) {
  const password_hash = await hashAdminPassword(password);
  const { data, error } = await supabase
    .from("admin_users")
    .update({
      password_hash,
      force_password_change: forcePasswordChange ?? false,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      const existing = state.users.find((user) => user.id === id);
      if (!existing) throw new Error("Admin user not found.");
      const updated: AdminUserRecord = {
        ...existing,
        password_hash,
        force_password_change: forcePasswordChange ?? false,
        updated_at: new Date().toISOString()
      };
      await saveFallbackAdminUsersState(supabase, {
        users: state.users.map((user) => (user.id === id ? updated : user))
      });
      return;
    }
    throwAdminUserError(error);
  }

  if (!data) {
    const state = await loadFallbackAdminUsersState(supabase);
    const existing = state.users.find((user) => user.id === id);
    if (!existing) throw new Error("Admin user not found.");
    const updated: AdminUserRecord = {
      ...existing,
      password_hash,
      force_password_change: forcePasswordChange ?? false,
      updated_at: new Date().toISOString()
    };
    await saveFallbackAdminUsersState(supabase, {
      users: state.users.map((user) => (user.id === id ? updated : user))
    });
  }
}

export async function deleteAdminUser(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("admin_users").delete().eq("id", id);
  if (error) {
    if (isMissingAdminUsersTable(error)) {
      const state = await loadFallbackAdminUsersState(supabase);
      await saveFallbackAdminUsersState(supabase, {
        users: state.users.filter((user) => user.id !== id)
      });
      return;
    }
    throwAdminUserError(error);
  }
}

export async function touchAdminUserLogin(supabase: SupabaseClient, id: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("admin_users").update({ last_login_at: now }).eq("id", id);
  if (error && isMissingAdminUsersTable(error)) {
    const state = await loadFallbackAdminUsersState(supabase);
    await saveFallbackAdminUsersState(supabase, {
      users: state.users.map((user) => (user.id === id ? { ...user, last_login_at: now, updated_at: now } : user))
    });
  }
}
