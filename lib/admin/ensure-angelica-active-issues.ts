/**
 * Ensure Angelica’s DigiBoard account can open Active Issues.
 * Keeps admin / management / front desk / team lead roles as-is; otherwise
 * promotes to Front Desk Coordinator (which includes Active Issues) and syncs access.
 */
import {
  canAccessAdminTab,
  accessFromLegacyRole
} from "@/lib/admin/permissions";
import { loadRolePermissionMatrix, saveRolePermissionMatrix } from "@/lib/admin/role-permission-matrix";
import { syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";
import {
  isAdminOrManagementRole,
  listAdminUsers,
  updateAdminUser,
  type AdminUserPublic,
  type AdminUserRole
} from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const FALLBACK_ROLE = "front_desk_coordinator" as const;
const ENSURE_FLAG_KEY = "angelica_active_issues_ensured_v1";
export const ANGELICA_REQUIRED_TABS = ["active_issues"] as const;

const ROLES_WITH_ACTIVE_ISSUES: readonly AdminUserRole[] = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader"
];

export function matchesAngelicaAccount(user: Pick<AdminUserPublic, "full_name" | "email">) {
  const name = user.full_name.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  return (
    name === "angelica" ||
    name.startsWith("angelica ") ||
    name.includes(" angelica") ||
    email.startsWith("angelica@") ||
    email.includes("angelica")
  );
}

export function pickAngelicaTarget(matches: AdminUserPublic[]): AdminUserPublic | null {
  if (!matches.length) return null;
  return (
    matches.find((user) => user.full_name.trim().toLowerCase().startsWith("angelica")) ??
    matches.find((user) => user.email.trim().toLowerCase().includes("angelica")) ??
    matches[0]
  );
}

export function roleAlreadyHasActiveIssues(role: AdminUserRole | string) {
  return ROLES_WITH_ACTIVE_ISSUES.includes(role as AdminUserRole) || isAdminOrManagementRole(role);
}

export function angelicaHasActiveIssuesAccess(user: AdminUserPublic) {
  const roleForAccess = roleAlreadyHasActiveIssues(user.role) ? user.role : FALLBACK_ROLE;
  const access = accessFromLegacyRole(user.id, user.email, roleForAccess);
  return ANGELICA_REQUIRED_TABS.every((tab) => canAccessAdminTab(access, tab, roleForAccess, "staff"));
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

export type EnsureAngelicaResult = {
  skipped: boolean;
  reason?: string;
  target?: {
    id: string;
    full_name: string;
    email: string;
    previous_role: string;
    role: string;
  };
  tabAccess?: Record<(typeof ANGELICA_REQUIRED_TABS)[number], boolean>;
};

/**
 * Idempotent ensure. Safe to call from dashboard boot (fire-and-forget).
 * When `force` is true, skips the one-time settings flag check.
 */
export async function ensureAngelicaActiveIssues(
  supabase: SupabaseClient,
  options: { force?: boolean } = {}
): Promise<EnsureAngelicaResult> {
  if (!options.force && (await readEnsureFlag(supabase))) {
    return { skipped: true, reason: "already_ensured" };
  }

  const users = await listAdminUsers(supabase);
  const matches = users.filter(matchesAngelicaAccount);
  const target = pickAngelicaTarget(matches);
  if (!target) {
    return { skipped: true, reason: "no_match" };
  }

  const previousRole = target.role;
  let nextRole = target.role;
  if (!roleAlreadyHasActiveIssues(target.role)) {
    nextRole = FALLBACK_ROLE;
    await updateAdminUser(supabase, target.id, { role: FALLBACK_ROLE });
  }

  await syncUserAccessFromLegacyRole(supabase, target.id, nextRole);
  const matrix = await loadRolePermissionMatrix(supabase);
  await saveRolePermissionMatrix(supabase, matrix);

  const access = accessFromLegacyRole(target.id, target.email, nextRole);
  const tabAccess = Object.fromEntries(
    ANGELICA_REQUIRED_TABS.map((tab) => [tab, canAccessAdminTab(access, tab, nextRole, "staff")])
  ) as Record<(typeof ANGELICA_REQUIRED_TABS)[number], boolean>;

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
