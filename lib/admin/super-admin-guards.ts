import {
  isSuperAdminAccess,
  isSuperAdminLegacyRole,
  type RoleKey,
  type UserAccess
} from "@/lib/admin/permissions";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function countActiveSuperAdmins(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner_admin")
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

export function targetIsSuperAdmin(legacyRole?: string | null, access?: UserAccess | null) {
  if (isSuperAdminLegacyRole(legacyRole)) return true;
  return isSuperAdminAccess(access ?? null);
}

export function actorCanManageTarget(
  actorLegacyRole: string | undefined,
  actorAccess: UserAccess | null,
  targetLegacyRole?: string | null,
  targetAccess?: UserAccess | null
) {
  if (!targetIsSuperAdmin(targetLegacyRole, targetAccess)) return true;
  return isSuperAdminLegacyRole(actorLegacyRole) || isSuperAdminAccess(actorAccess);
}

export async function assertUserMutationAllowed(input: {
  supabase: SupabaseClient;
  actorLegacyRole?: string | null;
  actorAccess: UserAccess | null;
  targetUserId: string;
  targetLegacyRole?: string | null;
  targetAccess?: UserAccess | null;
  nextPrimaryRole?: RoleKey;
  nextStatus?: "active" | "disabled";
  action: "update" | "delete" | "disable";
}) {
  const {
    supabase,
    actorLegacyRole,
    actorAccess,
    targetLegacyRole,
    targetAccess,
    nextPrimaryRole,
    nextStatus,
    action
  } = input;

  if (
    targetIsSuperAdmin(targetLegacyRole, targetAccess) &&
    !actorCanManageTarget(actorLegacyRole ?? undefined, actorAccess, targetLegacyRole, targetAccess)
  ) {
    throw new Error("Only Super Admin can modify Super Admin accounts.");
  }

  if (nextPrimaryRole === "super_admin" && !isSuperAdminLegacyRole(actorLegacyRole) && !isSuperAdminAccess(actorAccess)) {
    throw new Error("Only Super Admin can assign the Super Admin role.");
  }

  const removingSuperAdmin =
    targetIsSuperAdmin(targetLegacyRole, targetAccess) &&
    ((nextPrimaryRole && nextPrimaryRole !== "super_admin") ||
      action === "delete" ||
      nextStatus === "disabled");

  if (removingSuperAdmin) {
    const count = await countActiveSuperAdmins(supabase);
    if (count <= 1) {
      throw new Error("Cannot remove or downgrade the last active Super Admin.");
    }
  }
}
