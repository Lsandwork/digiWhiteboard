import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import type { PermissionKey, RoleKey } from "@/lib/admin/permissions";
import { loadRolePermissionMatrix, isPermissionLockedForRole, setRolePermission } from "@/lib/admin/role-permission-matrix";
import { assertUserMutationAllowed } from "@/lib/admin/super-admin-guards";
import { roleAssignmentError } from "@/lib/admin/user-creation-access";
import { getUserAccess, roleKeyToLegacyRole, setUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById, updateAdminUser, type AdminUserRole } from "@/lib/admin/users";
import { isGeminiConfigured } from "@/lib/hr/gemini-config";
import { dispatchPersonalStaffEmailNotification, listStaffOps } from "@/lib/staff/admin-ops";
import type { EngagementContext } from "@/lib/team-engagement/authorize";
import { once, type AccessControlPort, type SecurityEvent, type ServiceContext } from "@/lib/team-engagement/context";
import { loadEngagementDirectory, type EngagementDirectory } from "@/lib/team-engagement/directory";
import { EngagementError, mapDbError, notFoundError } from "@/lib/team-engagement/errors";
import { createGeminiModerationAi } from "@/lib/team-engagement/moderation";
import { operationsSnapshotFromState } from "@/lib/team-engagement/operations";
import { loadEngagementSettings } from "@/lib/team-engagement/settings";

const LEADERSHIP_ROLES = new Set<RoleKey>(["super_admin", "admin", "management"]);

const SECURITY_ACTIONS: Record<string, string> = {
  "admin.impersonate.start": "Started “Log In As Employee”",
  "admin.impersonate.stop": "Ended “Log In As Employee”",
  "admin.user.create": "Created an account",
  "admin.user.disable": "Disabled an account",
  "admin.user.delete": "Deleted an account",
  "admin.user.update": "Changed account access",
  "rbac.permission.update": "Changed a role permission",
  "rbac.matrix.bulk_update": "Changed role permissions",
  "rbac.matrix.reset_defaults": "Reset role permissions",
  "team_engagement.access_denied": "Refused Team Engagement request"
};

function createAccessControl(supabase: SupabaseClient): AccessControlPort {
  return {
    async changePrimaryRole({ targetUserId, nextPrimaryRole, reason, actor }) {
      const [actorAccess, existing] = await Promise.all([
        getUserAccess(supabase, actor.userId, actor.legacyRole, actor.email),
        getAdminUserById(supabase, targetUserId)
      ]);
      if (!existing) throw notFoundError("That team member");
      const existingAccess = await getUserAccess(supabase, targetUserId, existing.role, existing.email);
      await assertUserMutationAllowed({
        supabase,
        actorLegacyRole: actor.legacyRole,
        actorAccess,
        targetUserId,
        targetLegacyRole: existing.role,
        targetAccess: existingAccess,
        nextPrimaryRole,
        action: "update"
      });
      const roleError = roleAssignmentError(actorAccess, actor.legacyRole, [nextPrimaryRole], existingAccess.roles);
      if (roleError) throw new EngagementError(403, "forbidden", roleError);

      const kept = existingAccess.roles.filter(
        (role) => role !== existingAccess.primaryRole && role !== nextPrimaryRole && !LEADERSHIP_ROLES.has(role)
      );
      await updateAdminUser(supabase, targetUserId, { role: roleKeyToLegacyRole(nextPrimaryRole) as AdminUserRole });
      await setUserAccess(supabase, targetUserId, {
        primaryRole: nextPrimaryRole,
        roles: [nextPrimaryRole, ...kept],
        departments: existingAccess.departments
      });
      await writeAdminAuditLog({
        actorAdminId: actor.userId,
        actorEmail: actor.email,
        action: "admin.user.update",
        targetType: "admin_user",
        targetId: targetUserId,
        details: { source: "team_engagement", previous_role: existingAccess.primaryRole, primary_role: nextPrimaryRole, reason }
      });
      return { previousRole: existingAccess.primaryRole, nextRole: nextPrimaryRole };
    },

    async setRolePermission({ role, permission, enabled }) {
      const matrix = await loadRolePermissionMatrix(supabase);
      const previous = matrix[role]?.[permission] === true;
      const saved = await setRolePermission(supabase, role, permission as PermissionKey, enabled);
      return { previous, next: saved[role]?.[permission] === true };
    },

    loadRoleMatrix: () => loadRolePermissionMatrix(supabase),

    isPermissionLocked: (role, permission) => isPermissionLockedForRole(role, permission as PermissionKey)
  };
}

async function loadSecurityEvents(supabase: SupabaseClient, directory: () => Promise<EngagementDirectory>): Promise<SecurityEvent[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("action, actor_email, target_id, details, created_at")
    .in("action", Object.keys(SECURITY_ACTIONS))
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw mapDbError(error);
  const people = await directory();
  const byEmail = new Map(people.employees.map((employee) => [employee.email.toLowerCase(), employee.name]));
  const events: SecurityEvent[] = [];
  for (const row of (data ?? []) as {
    action: string;
    actor_email: string | null;
    target_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }[]) {
    const details = row.details ?? {};
    if (row.action === "admin.user.update" && !("primary_role" in details || "role" in details || "additional_roles" in details || "departments" in details)) {
      continue;
    }
    const targetName = row.target_id ? people.byId.get(row.target_id)?.name ?? null : null;
    events.push({
      at: row.created_at,
      action: SECURITY_ACTIONS[row.action] ?? row.action,
      actorName: (row.actor_email && byEmail.get(row.actor_email.toLowerCase())) || row.actor_email || "Unknown account",
      targetLabel: targetName
    });
    if (events.length >= 100) break;
  }
  return events;
}

/** Wires Team Engagement services to RuffOps' existing accounts, staff tools, notifications, and role storage. */
export function createServiceContext(context: EngagementContext): ServiceContext {
  const { supabase, db, actor, storageReady } = context;
  const staffOps = once(() => listStaffOps(supabase));
  const directory = once(() => loadEngagementDirectory(supabase, staffOps));
  return {
    db,
    actor,
    storageReady,
    now: () => new Date(),
    directory,
    settings: once(() => loadEngagementSettings(db)),
    moderationAi: (redact) => (isGeminiConfigured() ? createGeminiModerationAi({ redact }) : null),
    aiConfigured: () => isGeminiConfigured(),
    operations: once(async () => operationsSnapshotFromState(await staffOps())),
    async notify(notification) {
      const recipient = (await directory()).byId.get(notification.recipientUserId);
      if (!recipient?.active || !recipient.email.includes("@")) return;
      await dispatchPersonalStaffEmailNotification(
        supabase,
        {
          eventType: "updated",
          sourceTable: "team_engagement",
          sourceId: notification.dedupeKey,
          sourceTab: "management_support",
          title: notification.title,
          body: notification.body,
          priority: "Normal",
          actor: actor.name,
          dedupeKey: `team_engagement:${notification.dedupeKey}`
        },
        recipient.email
      );
    },
    accessControl: createAccessControl(supabase),
    securityEvents: () => loadSecurityEvents(supabase, directory),
    async loadAvatar(userId) {
      const { data, error } = await supabase.from("admin_users").select("avatar_url").eq("id", userId).maybeSingle();
      if (error) throw mapDbError(error);
      const value = (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
      return typeof value === "string" && (value.startsWith("data:image/") || value.startsWith("https://")) ? value : null;
    }
  };
}
