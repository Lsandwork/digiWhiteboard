/**
 * Ensure Rebeca’s DigiBoard panel includes Fitdog Alerts, Walks Board,
 * Vet Visits, and Track Incidents by setting her role to Front Desk Coordinator
 * (when she is not already an admin/management account) and syncing access.
 */
import {
  canAccessAdminTab,
  accessFromLegacyRole,
  FRONT_DESK_COORDINATOR_TABS
} from "@/lib/admin/permissions";
import { loadRolePermissionMatrix, saveRolePermissionMatrix } from "@/lib/admin/role-permission-matrix";
import { syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";
import {
  isAdminOrManagementRole,
  listAdminUsers,
  updateAdminUser,
  type AdminUserPublic
} from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const TARGET_ROLE = "front_desk_coordinator" as const;
const ENSURE_FLAG_KEY = "rebeca_front_desk_panel_ensured_v1";
export const REBECA_REQUIRED_TABS = ["fitdog_alerts", "walks_board", "vet_visits", "track_incidents"] as const;

export function matchesRebecaAccount(user: Pick<AdminUserPublic, "full_name" | "email">) {
  const name = user.full_name.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  return (
    name === "rebeca" ||
    name.startsWith("rebeca ") ||
    name.includes(" rebeca") ||
    name === "rebecca" ||
    name.startsWith("rebecca ") ||
    name.includes(" rebecca") ||
    email.startsWith("rebeca@") ||
    email.startsWith("rebecca@") ||
    email.includes("rebeca") ||
    email.includes("rebecca")
  );
}

export function pickRebecaTarget(matches: AdminUserPublic[]): AdminUserPublic | null {
  if (!matches.length) return null;
  return (
    matches.find((user) => user.full_name.trim().toLowerCase().startsWith("rebeca")) ??
    matches.find((user) => user.full_name.trim().toLowerCase().startsWith("rebecca")) ??
    matches[0]
  );
}

export function rebecaHasRequiredPanelTabs(user: AdminUserPublic) {
  const roleForAccess =
    isAdminOrManagementRole(user.role) || user.role === TARGET_ROLE ? user.role : TARGET_ROLE;
  const access = accessFromLegacyRole(user.id, user.email, roleForAccess);
  return REBECA_REQUIRED_TABS.every((tab) => canAccessAdminTab(access, tab, roleForAccess, "staff"));
}

async function readEnsureFlag(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return Boolean(settings[ENSURE_FLAG_KEY]);
}

async function writeEnsureFlag(supabase: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [ENSURE_FLAG_KEY]: payload
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export type EnsureRebecaResult = {
  skipped: boolean;
  reason?: string;
  target?: {
    id: string;
    full_name: string;
    email: string;
    previous_role: string;
    role: string;
  };
  tabAccess?: Record<(typeof REBECA_REQUIRED_TABS)[number], boolean>;
};

/**
 * Idempotent ensure. Safe to call from dashboard boot (fire-and-forget).
 * When `force` is true, skips the one-time settings flag check.
 */
export async function ensureRebecaFrontDeskPanel(
  supabase: SupabaseClient,
  options: { force?: boolean } = {}
): Promise<EnsureRebecaResult> {
  if (!options.force && (await readEnsureFlag(supabase))) {
    return { skipped: true, reason: "already_ensured" };
  }

  const missingFromRoleTabs = REBECA_REQUIRED_TABS.filter(
    (tab) => !(FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab)
  );
  if (missingFromRoleTabs.length) {
    throw new Error(`FRONT_DESK_COORDINATOR_TABS is missing: ${missingFromRoleTabs.join(", ")}`);
  }

  const users = await listAdminUsers(supabase);
  const matches = users.filter(matchesRebecaAccount);
  const target = pickRebecaTarget(matches);
  if (!target) {
    return { skipped: true, reason: "no_match" };
  }

  const previousRole = target.role;
  let nextRole = target.role;
  if (!isAdminOrManagementRole(target.role) && target.role !== TARGET_ROLE) {
    nextRole = TARGET_ROLE;
    await updateAdminUser(supabase, target.id, { role: TARGET_ROLE });
  }

  await syncUserAccessFromLegacyRole(supabase, target.id, nextRole);
  const matrix = await loadRolePermissionMatrix(supabase);
  await saveRolePermissionMatrix(supabase, matrix);

  const access = accessFromLegacyRole(target.id, target.email, nextRole);
  const tabAccess = Object.fromEntries(
    REBECA_REQUIRED_TABS.map((tab) => [tab, canAccessAdminTab(access, tab, nextRole, "staff")])
  ) as Record<(typeof REBECA_REQUIRED_TABS)[number], boolean>;

  await writeEnsureFlag(supabase, {
    at: new Date().toISOString(),
    user_id: target.id,
    email: target.email,
    previous_role: previousRole,
    role: nextRole,
    tabAccess
  });

  return {
    skipped: false,
    target: {
      id: target.id,
      full_name: target.full_name,
      email: target.email,
      previous_role: previousRole,
      role: nextRole
    },
    tabAccess
  };
}
