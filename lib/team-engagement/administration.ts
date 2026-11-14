import { ROLE_LABELS, type RoleKey } from "@/lib/admin/permissions";
import {
  ENGAGEMENT_DEPARTMENTS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  MIN_AUDIT_RETENTION_DAYS,
  TEAM_ENGAGEMENT_MIGRATION,
  departmentLabel
} from "@/lib/team-engagement/constants";
import { auditOp, daysAgoIso, nowIso, requireStorage, requireUuid, text, type ServiceContext } from "@/lib/team-engagement/context";
import { EngagementError, conflictError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { ENGAGEMENT_PERMISSION_KEYS, TIER_LABELS, type EngagementPermission } from "@/lib/team-engagement/permissions";
import {
  normalizeAiPolicy,
  normalizeCategories,
  normalizeFeatures,
  normalizeParticipation,
  normalizeRetention,
  settingValue
} from "@/lib/team-engagement/settings";
import { ENGAGEMENT_TABLES, type AuditEventRow, type DepartmentManagerRow, type PurgePlan, type SettingKey } from "@/lib/team-engagement/types";

const REASON_MIN = 10;
const AI_TEST_TIMEOUT_MS = 10_000;

function requireReason(value: unknown) {
  const reason = text(value, 500);
  if (reason.length < REASON_MIN) throw validationError("Add a reason of at least a few words. It is saved in the audit history.");
  return reason;
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

const SETTING_NORMALIZERS: Record<SettingKey, (value: unknown) => unknown> = {
  categories: (value) => normalizeCategories(value, true),
  participation: normalizeParticipation,
  ai_policy: normalizeAiPolicy,
  features: normalizeFeatures,
  retention: normalizeRetention
};

export async function settingsView(ctx: ServiceContext) {
  const settings = await ctx.settings();
  const superAdmin = ctx.actor.tier === "super_admin";
  return {
    storageReady: ctx.storageReady,
    categories: settings.categories,
    participation: settings.participation,
    revisions: settings.revisions,
    updated: settings.updated,
    aiPolicy: superAdmin ? settings.aiPolicy : null,
    features: settings.features,
    featureLabels: FEATURE_LABELS,
    retention: superAdmin ? settings.retention : null
  };
}

export async function saveSetting(ctx: ServiceContext, key: SettingKey, input: { value?: unknown; revision?: unknown; reason?: unknown }) {
  requireStorage(ctx);
  const settings = await ctx.settings();
  const current = settings.revisions[key] ?? 0;
  if (Number(input.revision ?? -1) !== current) {
    throw conflictError("Someone else changed these settings. Refresh to see the latest values.");
  }
  const value = SETTING_NORMALIZERS[key](input.value);
  const previous = settingValue(settings, key);
  if (JSON.stringify(previous) === JSON.stringify(value)) return { key, revision: current, value, unchanged: true };
  const reason = key === "features" || key === "retention" || key === "ai_policy" ? requireReason(input.reason) : text(input.reason, 500) || null;
  const at = nowIso(ctx);
  const revision = current + 1;
  const write =
    current === 0
      ? {
          op: "insert" as const,
          table: "team_engagement_settings" as const,
          values: { setting_key: key, value, revision, updated_by_user_id: ctx.actor.userId, updated_by_name: ctx.actor.name, updated_at: at }
        }
      : {
          op: "update" as const,
          table: "team_engagement_settings" as const,
          match: { setting_key: key, revision: current },
          set: { value, revision, updated_by_user_id: ctx.actor.userId, updated_by_name: ctx.actor.name, updated_at: at },
          expectRows: 1
        };
  try {
    await ctx.db.commit([
      write,
      auditOp(ctx, {
        category: key === "features" || key === "retention" ? "security" : "configuration",
        action: `settings.${key}`,
        targetType: "setting",
        targetId: key,
        targetLabel: key.replace(/_/g, " "),
        previous,
        next: value,
        reason
      })
    ]);
  } catch (error) {
    if (error instanceof EngagementError && error.code === "duplicate") {
      throw conflictError("Someone else changed these settings. Refresh to see the latest values.");
    }
    throw error;
  }
  return { key, revision, value, unchanged: false };
}

// ---------------------------------------------------------------------------------------------
// AI policy
// ---------------------------------------------------------------------------------------------

export async function aiPolicyView(ctx: ServiceContext) {
  const settings = await ctx.settings();
  const configured = ctx.aiConfigured();
  const { rows } = ctx.storageReady
    ? await ctx.db.select<AuditEventRow>("team_engagement_audit_events", {
        filters: [{ column: "action", op: "eq", value: "ai.test_connection" }],
        order: [{ column: "occurred_at", ascending: false }],
        limit: 1
      })
    : { rows: [] as AuditEventRow[] };
  const lastTest = rows[0];
  return {
    policy: settings.aiPolicy,
    revision: settings.revisions.ai_policy,
    provider: "Google Gemini",
    configured,
    status: !configured ? "not_configured" : settings.aiPolicy.enabled ? "configured" : "disabled",
    lastTest: lastTest
      ? { at: lastTest.occurred_at, by: lastTest.actor_name, result: (lastTest.new_value as { ok?: boolean } | null)?.ok === true ? "passed" : "failed" }
      : null,
    statement: configured
      ? "Every Bark Out is checked by RuffOps' built-in rules first. When AI moderation is on, Gemini reviews the rest with names removed. Anything uncertain goes to a person."
      : "AI moderation is not connected because GEMINI_API_KEY is not set. RuffOps' built-in rules still screen every Bark Out, and anything they can't clear goes to human review."
  };
}

export async function testAiConnection(ctx: ServiceContext) {
  requireStorage(ctx);
  const started = Date.now();
  let ok = false;
  let message: string;
  let model: string | null = null;
  if (!ctx.aiConfigured()) {
    message = "GEMINI_API_KEY is not set, so there is nothing to test. Add it in the hosting environment to connect AI moderation.";
  } else {
    const ai = ctx.moderationAi([]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = ai
        ? await Promise.race([
            ai.classify({ message: "Thanks for jumping in to help walk the big dogs during the lunch rush today!", context: null, category: "helping_coworker" }),
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), AI_TEST_TIMEOUT_MS);
            })
          ])
        : null;
      if (result) {
        ok = true;
        model = result.model;
        message = `Gemini answered in ${Date.now() - started} ms and classified the sample as ${result.verdict}.`;
      } else {
        message = "Gemini did not return a usable answer.";
      }
    } catch {
      message = "Gemini did not respond. Bark Outs will keep going to human review until it does.";
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  await ctx.db.commit([
    auditOp(ctx, {
      category: "configuration",
      action: "ai.test_connection",
      targetType: "integration",
      targetId: "gemini",
      targetLabel: "AI moderation",
      next: { ok, model, latencyMs: Date.now() - started }
    })
  ]);
  return { ok, message, model };
}

// ---------------------------------------------------------------------------------------------
// Access: roles and the permission matrix
// ---------------------------------------------------------------------------------------------

export const ASSIGNABLE_ROLES: RoleKey[] = [
  "super_admin",
  "admin",
  "management",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "daycare",
  "trainer",
  "driver",
  "overnight",
  "maintenance",
  "staff",
  "marketing"
];

const ELEVATED_ROLES = new Set<RoleKey>(["super_admin", "admin"]);

function requireAccessControl(ctx: ServiceContext) {
  if (!ctx.accessControl) throw new EngagementError(503, "unavailable", "Role management is unavailable right now.");
  return ctx.accessControl;
}

export async function accessView(ctx: ServiceContext) {
  const [directory, managers] = await Promise.all([
    ctx.directory(),
    ctx.storageReady
      ? ctx.db.select<DepartmentManagerRow>("team_engagement_department_managers", { limit: 1000 })
      : Promise.resolve({ rows: [] as DepartmentManagerRow[], total: null })
  ]);
  const managed = new Map<string, string[]>();
  for (const row of managers.rows) managed.set(row.manager_user_id, [...(managed.get(row.manager_user_id) ?? []), row.department_key]);
  const people = directory.employees.map((employee) => ({
    userId: employee.userId,
    name: employee.name,
    title: employee.title,
    active: employee.active,
    tier: employee.tier,
    tierLabel: employee.tier ? TIER_LABELS[employee.tier] : null,
    roleLabel: ROLE_LABELS[employee.legacyRole as RoleKey] ?? employee.legacyRole.replace(/_/g, " "),
    departments: employee.departments.map((key) => ({ key, label: departmentLabel(key) })),
    managedDepartments: (managed.get(employee.userId) ?? []).map((key) => ({ key, label: departmentLabel(key) })),
    isSelf: employee.userId === ctx.actor.userId
  }));
  return {
    superAdmins: people.filter((person) => person.tier === "super_admin"),
    admins: people.filter((person) => person.tier === "admin"),
    management: people.filter((person) => person.tier === "management"),
    others: people.filter((person) => !person.tier && person.active),
    assignableRoles: ASSIGNABLE_ROLES.map((role) => ({ role, label: ROLE_LABELS[role], elevated: ELEVATED_ROLES.has(role) })),
    departments: ENGAGEMENT_DEPARTMENTS.map((key) => ({ key, label: departmentLabel(key) })),
    rules: [
      "Only Super Admin can grant or remove Admin and Super Admin access.",
      "Nobody can change their own role here. Another Super Admin makes that change.",
      "RuffOps keeps at least one active Super Admin.",
      "Every change needs a reason and is recorded in the audit history."
    ]
  };
}

export async function changeRole(ctx: ServiceContext, input: { userId?: unknown; role?: unknown; reason?: unknown; confirmName?: unknown }) {
  requireStorage(ctx);
  const access = requireAccessControl(ctx);
  const userId = requireUuid(input.userId, "team member");
  if (userId === ctx.actor.userId) {
    throw new EngagementError(403, "self_change", "You can't change your own role. Ask another Super Admin.");
  }
  if (typeof input.role !== "string" || !(ASSIGNABLE_ROLES as string[]).includes(input.role)) throw validationError("Choose a role.");
  const role = input.role as RoleKey;
  const reason = requireReason(input.reason);
  const target = (await ctx.directory()).byId.get(userId);
  if (!target) throw notFoundError("That team member");
  if (!target.active) throw validationError("Turn the account back on in User Management before changing its role.");
  const elevating = ELEVATED_ROLES.has(role) || target.tier === "super_admin" || target.tier === "admin";
  if (elevating && text(input.confirmName, 120).toLowerCase() !== target.name.trim().toLowerCase()) {
    throw validationError(`Type ${target.name} to confirm this access change.`);
  }

  let result: { previousRole: RoleKey; nextRole: RoleKey };
  try {
    result = await access.changePrimaryRole({ targetUserId: userId, nextPrimaryRole: role, reason, actor: ctx.actor });
  } catch (error) {
    if (error instanceof EngagementError) throw error;
    throw new EngagementError(403, "forbidden", error instanceof Error ? error.message : "That change isn't allowed.");
  }
  await ctx.db.commit([
    auditOp(ctx, {
      category: "access",
      action: "role.change",
      targetType: "admin_user",
      targetId: userId,
      targetLabel: target.name,
      previous: { role: result.previousRole },
      next: { role: result.nextRole },
      reason
    })
  ]);
  return { userId, previousRole: result.previousRole, role: result.nextRole };
}

const MATRIX_ROLES: RoleKey[] = [
  "admin",
  "management",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "daycare",
  "trainer",
  "driver",
  "hiker",
  "overnight",
  "maintenance",
  "staff",
  "marketing",
  "viewer"
];

export async function permissionsView(ctx: ServiceContext) {
  const access = requireAccessControl(ctx);
  const matrix = await access.loadRoleMatrix();
  return {
    roles: MATRIX_ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })),
    permissions: ENGAGEMENT_PERMISSION_KEYS.map((permission) => ({
      permission,
      cells: MATRIX_ROLES.map((role) => ({
        role,
        enabled: matrix[role]?.[permission] === true,
        locked: access.isPermissionLocked(role, permission)
      }))
    })),
    notes: [
      "Super Admin always holds every Team Engagement permission.",
      "Leadership permissions only take effect for Management, Admin, and Super Admin, even if switched on for another role.",
      "Locked cells are protected: Super Admin-only controls can't be handed to other roles."
    ]
  };
}

export async function setRolePermission(
  ctx: ServiceContext,
  input: { role?: unknown; permission?: unknown; enabled?: unknown; reason?: unknown }
) {
  requireStorage(ctx);
  const access = requireAccessControl(ctx);
  if (typeof input.role !== "string" || !(MATRIX_ROLES as string[]).includes(input.role)) throw validationError("Choose a role.");
  const role = input.role as RoleKey;
  if (typeof input.permission !== "string" || !(ENGAGEMENT_PERMISSION_KEYS as string[]).includes(input.permission)) {
    throw validationError("Choose a Team Engagement permission.");
  }
  const permission = input.permission as EngagementPermission;
  if (typeof input.enabled !== "boolean") throw validationError("Choose whether to turn the permission on or off.");
  if (access.isPermissionLocked(role, permission)) {
    throw new EngagementError(403, "locked", "That permission is locked for this role.");
  }
  const reason = requireReason(input.reason);
  const result = await access.setRolePermission({ role, permission, enabled: input.enabled });
  await ctx.db.commit([
    auditOp(ctx, {
      category: "access",
      action: "permission.change",
      targetType: "role",
      targetId: role,
      targetLabel: `${ROLE_LABELS[role]} · ${permission}`,
      previous: { enabled: result.previous },
      next: { enabled: result.next },
      reason
    })
  ]);
  return { role, permission, enabled: result.next };
}

// ---------------------------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------------------------

function purgePlan(ctx: ServiceContext, retention: ReturnType<typeof normalizeRetention>): PurgePlan {
  return {
    rejected_before: daysAgoIso(ctx, retention.rejectedBarkOutDays),
    withdrawn_before: daysAgoIso(ctx, retention.withdrawnBarkOutDays),
    removed_before: daysAgoIso(ctx, retention.removedBarkOutDays),
    closed_feedback_before: daysAgoIso(ctx, retention.closedFeedbackDays),
    audit_before: daysAgoIso(ctx, Math.max(retention.auditDays, MIN_AUDIT_RETENTION_DAYS))
  };
}

async function countWhere(ctx: ServiceContext, table: (typeof ENGAGEMENT_TABLES)[number], filters: Parameters<ServiceContext["db"]["select"]>[1]) {
  const { total } = await ctx.db.select(table, { ...filters, limit: 1, count: true });
  return total ?? 0;
}

export async function retentionView(ctx: ServiceContext) {
  requireStorage(ctx);
  const settings = await ctx.settings();
  const plan = purgePlan(ctx, settings.retention);
  const [rejected, withdrawn, removed, feedback, audit, lastPurge] = await Promise.all([
    countWhere(ctx, "team_engagement_bark_outs", {
      filters: [
        { column: "status", op: "eq", value: "rejected" },
        { column: "created_at", op: "lt", value: plan.rejected_before! }
      ]
    }),
    countWhere(ctx, "team_engagement_bark_outs", {
      filters: [
        { column: "status", op: "eq", value: "withdrawn" },
        { column: "updated_at", op: "lt", value: plan.withdrawn_before! }
      ]
    }),
    countWhere(ctx, "team_engagement_bark_outs", {
      filters: [
        { column: "status", op: "eq", value: "removed" },
        { column: "updated_at", op: "lt", value: plan.removed_before! }
      ]
    }),
    countWhere(ctx, "team_engagement_feedback", {
      filters: [
        { column: "status", op: "in", value: ["resolved", "declined"] },
        { column: "updated_at", op: "lt", value: plan.closed_feedback_before! }
      ]
    }),
    countWhere(ctx, "team_engagement_audit_events", { filters: [{ column: "occurred_at", op: "lt", value: plan.audit_before! }] }),
    ctx.db.select<AuditEventRow>("team_engagement_audit_events", {
      filters: [{ column: "action", op: "eq", value: "retention.purge" }],
      order: [{ column: "occurred_at", ascending: false }],
      limit: 1
    })
  ]);
  const last = lastPurge.rows[0];
  return {
    retention: settings.retention,
    revision: settings.revisions.retention,
    minimumAuditDays: MIN_AUDIT_RETENTION_DAYS,
    preview: { rejected, withdrawn, removed, closedFeedback: feedback, auditEvents: audit },
    lastPurge: last ? { at: last.occurred_at, by: last.actor_name, counts: last.new_value } : null,
    schedule: "Purges run only when a Super Admin starts one here. Nothing is deleted automatically."
  };
}

export async function runRetentionPurge(ctx: ServiceContext, input: { confirmation?: unknown; reason?: unknown }) {
  requireStorage(ctx);
  if (input.confirmation !== "PURGE") throw validationError("Type PURGE to confirm.");
  const reason = requireReason(input.reason);
  const settings = await ctx.settings();
  const plan = purgePlan(ctx, settings.retention);
  const audit = auditOp(ctx, {
    category: "security",
    action: "retention.purge",
    targetType: "retention",
    targetId: "team_engagement",
    targetLabel: "Team Engagement data retention",
    previous: settings.retention,
    reason
  });
  if (audit.op !== "insert") throw forbiddenError();
  const counts = await ctx.db.purge(plan, audit.values);
  return { counts };
}

// ---------------------------------------------------------------------------------------------
// Security, integrations, and system health
// ---------------------------------------------------------------------------------------------

export async function securityView(ctx: ServiceContext) {
  const [events, engagementEvents] = await Promise.all([
    ctx.securityEvents().catch(() => null),
    ctx.storageReady
      ? ctx.db.select<AuditEventRow>("team_engagement_audit_events", {
          filters: [
            { column: "category", op: "in", value: ["security", "access"] },
            { column: "occurred_at", op: "gte", value: daysAgoIso(ctx, 30) }
          ],
          order: [{ column: "occurred_at", ascending: false }],
          limit: 100
        })
      : Promise.resolve({ rows: [] as AuditEventRow[], total: null })
  ]);
  return {
    accountEvents: events,
    accountEventsAvailable: events !== null,
    engagementEvents: engagementEvents.rows.map((row) => ({
      id: row.id,
      at: row.occurred_at,
      actorName: row.actor_name,
      action: row.action,
      targetLabel: row.target_label,
      reason: row.reason
    })),
    safeguards: [
      "Every Team Engagement request checks the signed-in account, its role, and its departments on the server.",
      "Demo sessions and “Log In As Employee” sessions can't open Team Engagement or change anything in it.",
      "“Log In As Employee” is limited to Super Admin, Admin, and Management, ends with the 12-hour session, and every start and stop is listed under account events.",
      "Audit history is append-only. Only a Super Admin retention purge can remove entries older than one year.",
      "Moderation reasons and AI results are visible only to moderators. Team members see a plain-language notice.",
      "Suggestions are not anonymous: RuffOps stores who sent each one, and leadership for their department can see it."
    ]
  };
}

export async function integrationsView(ctx: ServiceContext) {
  const settings = await ctx.settings();
  const tables = await ctx.db.tableStatus().catch(() => null);
  const ready = tables ? Object.values(tables).every(Boolean) : false;
  return {
    items: [
      {
        key: "storage",
        label: "Supabase storage",
        status: ready ? "ready" : "setup_required",
        detail: ready ? "All Team Engagement tables respond." : `Run ${TEAM_ENGAGEMENT_MIGRATION} in the Supabase SQL Editor.`
      },
      {
        key: "ai",
        label: "Google Gemini (AI moderation)",
        status: !ctx.aiConfigured() ? "not_configured" : settings.aiPolicy.enabled ? "configured" : "disabled",
        detail: !ctx.aiConfigured()
          ? "GEMINI_API_KEY is not set. Bark Outs the built-in rules can't clear go to human review."
          : "A key is present. Use Test connection on AI Policy Configuration to confirm Gemini answers."
      },
      {
        key: "notifications",
        label: "RuffOps notifications",
        status: "ready",
        detail: "Bark Out, suggestion, and nomination updates use the existing in-app notification center."
      },
      {
        key: "staff_ops",
        label: "Team Log, Owner Follow Up, and Active Issues",
        status: (await ctx.operations().catch(() => null)) ? "ready" : "error",
        detail: "Workload Intelligence reads open and closed work from these RuffOps tools."
      },
      {
        key: "scheduling",
        label: "Shift schedules and time clock",
        status: "not_available",
        detail: "RuffOps doesn't store schedules or hours, so coverage and hours worked are not measured."
      }
    ]
  };
}

export async function systemHealthView(ctx: ServiceContext) {
  const tables = await ctx.db.tableStatus().catch(() => null);
  const storageReady = tables ? Object.values(tables).every(Boolean) : false;
  let queue: { pending: number; oldestPendingAt: string | null; awaitingAuthor: number; openReports: number } | null = null;
  let lastPurge: string | null = null;
  if (storageReady) {
    const [pending, oldest, awaiting, reports, purge] = await Promise.all([
      countWhere(ctx, "team_engagement_bark_outs", { filters: [{ column: "status", op: "eq", value: "pending_review" }] }),
      ctx.db.select<{ created_at: string }>("team_engagement_bark_outs", {
        columns: ["created_at"],
        filters: [{ column: "status", op: "eq", value: "pending_review" }],
        order: [{ column: "created_at", ascending: true }],
        limit: 1
      }),
      countWhere(ctx, "team_engagement_bark_outs", { filters: [{ column: "status", op: "eq", value: "awaiting_confirmation" }] }),
      countWhere(ctx, "team_engagement_reports", { filters: [{ column: "status", op: "eq", value: "open" }] }),
      ctx.db.select<AuditEventRow>("team_engagement_audit_events", {
        filters: [{ column: "action", op: "eq", value: "retention.purge" }],
        order: [{ column: "occurred_at", ascending: false }],
        limit: 1
      })
    ]);
    queue = { pending, oldestPendingAt: oldest.rows[0]?.created_at ?? null, awaitingAuthor: awaiting, openReports: reports };
    lastPurge = purge.rows[0]?.occurred_at ?? null;
  }
  return {
    checkedAt: nowIso(ctx),
    migration: TEAM_ENGAGEMENT_MIGRATION,
    storageReady,
    tables: ENGAGEMENT_TABLES.map((table) => ({ table, ready: tables?.[table] ?? false })),
    moderation: queue,
    ai: { configured: ctx.aiConfigured() },
    jobs: [
      {
        key: "moderation",
        label: "Bark Out moderation",
        detail: "Runs during each submission. There is no background queue to monitor."
      },
      {
        key: "retention",
        label: "Retention purge",
        detail: lastPurge ? `Last run ${lastPurge}.` : "Has not been run. Purges start only from Data Retention."
      }
    ]
  };
}

export function featureControlsView(ctx: ServiceContext) {
  return ctx.settings().then((settings) => ({
    features: FEATURE_KEYS.map((key) => ({ key, label: FEATURE_LABELS[key], enabled: settings.features[key] })),
    revision: settings.revisions.features
  }));
}
