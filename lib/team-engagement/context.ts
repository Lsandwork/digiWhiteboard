import { randomUUID } from "node:crypto";
import type { DepartmentKey, RoleKey } from "@/lib/admin/permissions";
import { departmentLabel, type AuditCategory, type FeatureKey } from "@/lib/team-engagement/constants";
import type { EngagementDirectory } from "@/lib/team-engagement/directory";
import { EngagementError, forbiddenError, notFoundError, setupRequiredError } from "@/lib/team-engagement/errors";
import type { ModerationAi } from "@/lib/team-engagement/moderation";
import { canAccessEmployeeRecord, scopeIncludesDepartments, type DepartmentScope } from "@/lib/team-engagement/permissions";
import type { EngagementSettings } from "@/lib/team-engagement/settings";
import type { DbOp, EngagementActor, EngagementDb, EngagementEmployee } from "@/lib/team-engagement/types";
import { USER_INTERACTIONS_TIMEZONE } from "@/lib/user-interactions/pacific";

export type WorkItem = {
  source: "team_log" | "owner_follow_up" | "active_issue" | "body_check";
  department: DepartmentKey | null;
  assigneeName: string | null;
  open: boolean;
  urgent: boolean;
  overdue: boolean;
  createdAt: string;
  closedAt: string | null;
};

export type OperationsSnapshot = {
  items: WorkItem[];
  /** Data RuffOps does not record, listed so screens can say what the numbers leave out. */
  missing: string[];
};

export type EngagementNotification = {
  recipientUserId: string;
  title: string;
  body: string;
  dedupeKey: string;
};

export type RoleChangeRequest = {
  targetUserId: string;
  nextPrimaryRole: RoleKey;
  reason: string;
};

/** Role and permission changes go through RuffOps' existing user and role-matrix storage. */
export interface AccessControlPort {
  changePrimaryRole(input: RoleChangeRequest & { actor: EngagementActor }): Promise<{ previousRole: RoleKey; nextRole: RoleKey }>;
  setRolePermission(input: { role: RoleKey; permission: string; enabled: boolean }): Promise<{ previous: boolean; next: boolean }>;
  loadRoleMatrix(): Promise<Record<string, Record<string, boolean>>>;
  isPermissionLocked(role: RoleKey, permission: string): boolean;
}

export type ServiceContext = {
  db: EngagementDb;
  actor: EngagementActor;
  storageReady: boolean;
  now: () => Date;
  directory: () => Promise<EngagementDirectory>;
  settings: () => Promise<EngagementSettings>;
  moderationAi: (redact: readonly string[]) => ModerationAi | null;
  aiConfigured: () => boolean;
  operations: () => Promise<OperationsSnapshot | null>;
  notify: (notification: EngagementNotification) => Promise<void>;
  accessControl: AccessControlPort | null;
  securityEvents: () => Promise<SecurityEvent[]>;
  /** The photo already on the person's RuffOps account, read one person at a time. */
  loadAvatar: (userId: string) => Promise<string | null>;
};

export type SecurityEvent = {
  at: string;
  action: string;
  actorName: string;
  targetLabel: string | null;
};

export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export function requireStorage(ctx: Pick<ServiceContext, "storageReady">) {
  if (!ctx.storageReady) throw setupRequiredError();
}

export async function requireFeature(ctx: ServiceContext, feature: FeatureKey | undefined) {
  if (!feature) return;
  const settings = await ctx.settings();
  if (!settings.features[feature]) {
    throw new EngagementError(403, "feature_disabled", "This part of Team Engagement is turned off right now.");
  }
}

export function nowIso(ctx: Pick<ServiceContext, "now">) {
  return ctx.now().toISOString();
}

export function daysAgoIso(ctx: Pick<ServiceContext, "now">, days: number) {
  return new Date(ctx.now().getTime() - days * 86_400_000).toISOString();
}

export function addDaysToDateKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** UTC instant of midnight in the business timezone (America/Los_Angeles) for a YYYY-MM-DD key. */
export function pacificDayStartIso(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const probe = new Date(Date.UTC(y!, m! - 1, d!, 8));
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: USER_INTERACTIONS_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(probe)
  );
  return new Date(Date.UTC(y!, m! - 1, d!, 8 - hour)).toISOString();
}

export function pacificDateRange(fromKey: string, toKey: string) {
  return { startIso: pacificDayStartIso(fromKey), endIso: pacificDayStartIso(addDaysToDateKey(toKey, 1)) };
}

export function scopeLabel(scope: DepartmentScope) {
  if (scope.all) return "All departments";
  if (scope.departments.length === 0) return "No departments assigned";
  return scope.departments.map((key) => departmentLabel(key)).join(", ");
}

export function departmentsLabel(departments: readonly string[]) {
  if (!departments.length) return "All departments";
  return departments.map((key) => departmentLabel(key)).join(", ");
}

/** Leadership access to one employee's engagement records (development, nominations, feedback). */
export function canViewEmployee(actor: EngagementActor, employee: EngagementEmployee) {
  return canAccessEmployeeRecord(
    { userId: actor.userId, tier: actor.tier, scope: actor.scope },
    { userId: employee.userId, departments: employee.departments, tier: employee.tier }
  );
}

export async function requireEmployeeInScope(ctx: ServiceContext, userId: string): Promise<EngagementEmployee> {
  const directory = await ctx.directory();
  const employee = directory.byId.get(userId);
  if (!employee || !employee.active) throw notFoundError("That team member");
  if (!canViewEmployee(ctx.actor, employee)) throw forbiddenError();
  return employee;
}

/** Records that name people by department: Management sees them only for their departments. */
export function inScope(actor: EngagementActor, departments: readonly string[]) {
  return scopeIncludesDepartments(actor.scope, departments);
}

export function scopeFilterDepartments(actor: EngagementActor): string[] | null {
  return actor.scope.all ? null : actor.scope.departments;
}

export function auditOp(
  ctx: Pick<ServiceContext, "actor" | "now">,
  input: {
    category: AuditCategory;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    targetLabel?: string | null;
    scope?: string | null;
    previous?: unknown;
    next?: unknown;
    reason?: string | null;
  }
): DbOp {
  const at = nowIso(ctx);
  return {
    op: "insert",
    table: "team_engagement_audit_events",
    values: {
      id: randomUUID(),
      occurred_at: at,
      created_at: at,
      actor_user_id: ctx.actor.userId,
      actor_name: ctx.actor.name,
      actor_role: ctx.actor.tier ?? ctx.actor.legacyRole,
      category: input.category,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel?.slice(0, 160) ?? null,
      scope: input.scope ?? null,
      previous_value: input.previous ?? null,
      new_value: input.next ?? null,
      reason: input.reason?.slice(0, 1000) ?? null
    }
  };
}

export function text(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function multilineText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function optionalText(value: unknown, max: number): string | null {
  const result = multilineText(value, max);
  return result ? result : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function requireUuid(value: unknown, what = "record"): string {
  if (!isUuid(value)) throw new EngagementError(400, "invalid", `A valid ${what} is required.`);
  return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new EngagementError(400, "invalid", `Choose a valid ${what}.`);
}

export function isoDate(value: unknown, what: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new EngagementError(400, "invalid", `Enter a valid ${what}.`);
  }
  return raw;
}
