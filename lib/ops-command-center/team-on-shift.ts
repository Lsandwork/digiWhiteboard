import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_SIDEBAR_ROLE_LABELS, isAdminUserUuid, type AdminUserRole } from "@/lib/admin/users";
import { pacificTodayKey } from "@/lib/user-interactions/pacific";
import type { StaffDirectoryMember } from "@/lib/staff/admin-ops";
import type { TeamMemberCard } from "@/lib/ops-command-center/command-dashboard";
import { myShiftPortraitForName } from "@/lib/ops-command-center/my-shift-assets";

export type TeamOnShiftDailyRow = {
  admin_user_id: string;
  business_date: string;
  first_login_at: string;
  last_login_at: string;
};

export type ViewerShiftLogin = {
  businessDate: string;
  firstLoginAt: string | null;
};

const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE.has(error.code));
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "Staff";
  if (role in ADMIN_SIDEBAR_ROLE_LABELS) {
    return ADMIN_SIDEBAR_ROLE_LABELS[role as AdminUserRole];
  }
  return role.replace(/_/g, " ");
}

/** Record today's Pacific attendance after a successful staff login (server-only). */
export async function recordTeamOnShiftLogin(supabase: SupabaseClient, adminUserId: string, at = new Date()) {
  if (!isAdminUserUuid(adminUserId)) return;
  const loggedInAt = at.toISOString();
  const { error } = await supabase.rpc("record_ops_team_on_shift_login", {
    p_admin_user_id: adminUserId,
    p_logged_in_at: loggedInAt
  });
  if (error && isMissingTable(error)) return;
  if (error) {
    console.warn("[team-on-shift] record login failed", error.message);
  }
}

export async function listTeamOnShiftForBusinessDate(
  supabase: SupabaseClient,
  businessDate = pacificTodayKey()
): Promise<TeamOnShiftDailyRow[]> {
  if (!businessDate) return [];
  const { data, error } = await supabase
    .from("ops_team_on_shift_daily")
    .select("admin_user_id, business_date, first_login_at, last_login_at")
    .eq("business_date", businessDate)
    .order("first_login_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    console.warn("[team-on-shift] list failed", error.message);
    return [];
  }
  return (data ?? []) as TeamOnShiftDailyRow[];
}

type AdminUserJoin = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string | null;
};

export function mergeTeamOnShiftCards(input: {
  rows: TeamOnShiftDailyRow[];
  adminUsers: AdminUserJoin[];
  directory: StaffDirectoryMember[];
}): TeamMemberCard[] {
  const directoryByAdmin = new Map<string, StaffDirectoryMember>();
  for (const member of input.directory) {
    if (member.admin_user_id) {
      directoryByAdmin.set(member.admin_user_id, member);
    }
  }
  const usersById = new Map(input.adminUsers.map((user) => [user.id, user]));

  const team: TeamMemberCard[] = [];
  for (const row of input.rows) {
    const user = usersById.get(row.admin_user_id);
    if (!user || user.status !== "active") continue;
    if (user.email.toLowerCase().endsWith("@demo.com")) continue;
    const dir = directoryByAdmin.get(row.admin_user_id);
    const name = dir?.name || user.full_name || user.email;
    const department = dir?.department || "Unassigned";
    const role =
      dir?.role ||
      (dir?.dashboard_role ? roleLabel(dir.dashboard_role) : null) ||
      roleLabel(user.role);
    const avatarUrl = user.avatar_url || myShiftPortraitForName(name) || null;
    team.push({
      id: row.admin_user_id,
      name,
      role,
      department,
      status: "active",
      firstLoginAt: row.first_login_at,
      lastLoginAt: row.last_login_at,
      loggedInToday: true,
      avatarUrl
    });
  }
  return team.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadTeamOnShiftCards(
  supabase: SupabaseClient,
  directory: StaffDirectoryMember[],
  options?: { businessDate?: string; viewerAdminUserId?: string | null }
): Promise<{ businessDate: string; team: TeamMemberCard[]; viewer: ViewerShiftLogin }> {
  const date = options?.businessDate || pacificTodayKey();
  const rows = await listTeamOnShiftForBusinessDate(supabase, date);
  const viewer = viewerShiftLoginFromRows(rows, options?.viewerAdminUserId, date);
  if (!rows.length) {
    return { businessDate: date, team: [], viewer };
  }
  const ids = rows.map((row) => row.admin_user_id);
  const { data: users, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status, avatar_url")
    .in("id", ids);
  if (error) {
    if (isMissingTable(error)) return { businessDate: date, team: [], viewer };
    console.warn("[team-on-shift] admin_users join failed", error.message);
    return { businessDate: date, team: [], viewer };
  }
  return {
    businessDate: date,
    viewer,
    team: mergeTeamOnShiftCards({
      rows,
      adminUsers: (users ?? []) as AdminUserJoin[],
      directory
    })
  };
}

export function viewerShiftLoginFromRows(
  rows: TeamOnShiftDailyRow[],
  adminUserId: string | null | undefined,
  businessDate: string
): ViewerShiftLogin {
  if (!adminUserId) return { businessDate, firstLoginAt: null };
  const hit = rows.find((row) => row.admin_user_id === adminUserId);
  return { businessDate, firstLoginAt: hit?.first_login_at ?? null };
}