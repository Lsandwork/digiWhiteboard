import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import type { UserAccess } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest, type AdminSession } from "@/lib/admin/session";
import { getUserAccessMap } from "@/lib/admin/user-access";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isEngagementDepartment } from "@/lib/team-engagement/constants";
import { createSupabaseEngagementDb } from "@/lib/team-engagement/db";
import { EngagementError } from "@/lib/team-engagement/errors";
import {
  LEADERSHIP_ACTION_RULES,
  LEADERSHIP_VIEW_RULES,
  PARTICIPANT_ACTION_RULES,
  effectiveEngagementPermissions,
  evaluateRule,
  resolveDepartmentScope,
  teamEngagementTier,
  type LeadershipAction,
  type LeadershipView,
  type ParticipantAction,
  type ViewRule
} from "@/lib/team-engagement/permissions";
import type { DepartmentManagerRow, EngagementActor, EngagementDb } from "@/lib/team-engagement/types";

export type EngagementIdentity = {
  userId: string;
  name: string;
  email: string;
  legacyRole: string;
  status: string;
};

export type EngagementContext = {
  session: AdminSession;
  supabase: SupabaseClient;
  db: EngagementDb;
  actor: EngagementActor;
  /** False when the Team Engagement tables are missing (migration not run yet). */
  storageReady: boolean;
};

export type AccessDenial = {
  status: 403;
  code: "forbidden" | "impersonated";
  reason: string;
  message: string;
};

const FORBIDDEN_MESSAGE = "You do not have access to this part of Team Engagement.";
const IMPERSONATED_MESSAGE =
  "Team Engagement is unavailable while you are viewing RuffOps as another employee. Return to your own account to use it.";
const INACTIVE_MESSAGE = "Team Engagement needs an active RuffOps account.";

export function buildEngagementActor(input: {
  identity: EngagementIdentity;
  access: UserAccess;
  managedDepartments: readonly string[];
  impersonated: boolean;
}): EngagementActor {
  const { identity, access } = input;
  const tier = teamEngagementTier(access, identity.legacyRole);
  const permissions = effectiveEngagementPermissions(access, identity.legacyRole);
  const scope = resolveDepartmentScope({
    tier,
    permissions,
    accountDepartments: access.departments ?? [],
    managedDepartments: input.managedDepartments
  });
  return {
    userId: identity.userId,
    name: identity.name,
    email: identity.email,
    legacyRole: identity.legacyRole,
    tier,
    permissions,
    scope,
    departments: (access.departments ?? []).filter(isEngagementDepartment),
    impersonated: input.impersonated
  };
}

function denial(reason: string, code: AccessDenial["code"] = "forbidden"): AccessDenial {
  return { status: 403, code, reason, message: code === "impersonated" ? IMPERSONATED_MESSAGE : FORBIDDEN_MESSAGE };
}

/** Leadership screens and actions: Management, Admin, or Super Admin, never through an impersonated session. */
export function checkLeadershipRule(actor: EngagementActor, rule: ViewRule): AccessDenial | null {
  if (actor.impersonated) return denial("impersonated_session", "impersonated");
  const decision = evaluateRule(rule, actor, { leadership: true });
  return decision.allowed ? null : denial(decision.reason);
}

/** Employee Bark Out and suggestion actions. Reads work while impersonating; writes never do. */
export function checkParticipantRule(actor: EngagementActor, rule: ViewRule, options: { write: boolean }): AccessDenial | null {
  if (options.write && actor.impersonated) return denial("impersonated_session", "impersonated");
  const decision = evaluateRule(rule, actor, { leadership: false });
  return decision.allowed ? null : denial(decision.reason);
}

export function checkLeadershipView(actor: EngagementActor, view: LeadershipView) {
  return checkLeadershipRule(actor, LEADERSHIP_VIEW_RULES[view]);
}

export function checkLeadershipAction(actor: EngagementActor, action: LeadershipAction) {
  return checkLeadershipRule(actor, LEADERSHIP_ACTION_RULES[action]);
}

export function checkParticipantAction(actor: EngagementActor, action: ParticipantAction) {
  return checkParticipantRule(actor, PARTICIPANT_ACTION_RULES[action], { write: true });
}

export function checkParticipantRead(actor: EngagementActor) {
  return checkParticipantRule(actor, { permission: "engagement.participate" }, { write: false });
}

export function denialResponse(result: AccessDenial) {
  return Response.json({ error: result.message, code: result.code }, { status: result.status });
}

export function engagementErrorResponse(error: unknown) {
  if (error instanceof EngagementError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[team-engagement]", error instanceof Error ? error.message : error);
  return Response.json(
    { error: "Team Engagement could not complete that request. Try again shortly.", code: "server_error" },
    { status: 500 }
  );
}

const DENIAL_LOG_WINDOW_MS = 10 * 60 * 1000;
const recentDenials = new Map<string, number>();

/** Records a refused request once per person, reason, and target every ten minutes. */
export function logAccessDenial(context: Pick<EngagementContext, "db" | "actor" | "storageReady">, target: string, result: AccessDenial) {
  const key = `${context.actor.userId}:${result.reason}:${target}`;
  const now = Date.now();
  const last = recentDenials.get(key);
  if (last && now - last < DENIAL_LOG_WINDOW_MS) return;
  if (recentDenials.size > 500) recentDenials.clear();
  recentDenials.set(key, now);

  const event = {
    id: randomUUID(),
    created_at: new Date(now).toISOString(),
    actor_user_id: context.actor.userId,
    actor_name: context.actor.name,
    actor_role: context.actor.legacyRole,
    category: "security",
    action: "access.denied",
    target_type: "team_engagement",
    target_id: target.slice(0, 80),
    target_label: null,
    scope: null,
    previous_value: null,
    new_value: { reason: result.reason },
    reason: null,
    occurred_at: new Date(now).toISOString()
  };
  const write = context.storageReady
    ? context.db.commit([{ op: "insert", table: "team_engagement_audit_events", values: event }])
    : writeAdminAuditLog({
        actorAdminId: context.actor.userId,
        actorEmail: context.actor.email,
        action: "team_engagement.access_denied",
        targetType: "team_engagement",
        targetId: target.slice(0, 80),
        details: { reason: result.reason }
      });
  void Promise.resolve(write).catch(() => undefined);
}

async function loadIdentity(supabase: SupabaseClient, session: AdminSession): Promise<EngagementIdentity | null> {
  const columns = "id, full_name, email, role, status";
  const id = normalizeAdminUserId(session.adminUserId);
  const email = session.email?.trim().toLowerCase();
  const query = supabase.from("admin_users").select(columns);
  const { data, error } = id
    ? await query.eq("id", id).maybeSingle()
    : email
      ? await query.eq("email", email).maybeSingle()
      : { data: null, error: null };
  if (error || !data) return null;
  const row = data as { id: string; full_name: string | null; email: string; role: string; status: string };
  return {
    userId: row.id,
    name: row.full_name?.trim() || "RuffOps team member",
    email: row.email,
    legacyRole: row.role,
    status: row.status
  };
}

async function loadManagedDepartments(db: EngagementDb, userId: string): Promise<{ departments: string[]; storageReady: boolean }> {
  try {
    const { rows } = await db.select<DepartmentManagerRow>("team_engagement_department_managers", {
      filters: [{ column: "manager_user_id", op: "eq", value: userId }]
    });
    return { departments: rows.map((row) => row.department_key), storageReady: true };
  } catch (error) {
    if (error instanceof EngagementError && error.code === "setup_required") return { departments: [], storageReady: false };
    throw error;
  }
}

/**
 * Resolves who is calling from the signed session and a fresh read of their RuffOps account and role
 * assignments. Demo sessions, unknown accounts, and disabled accounts never get a context.
 */
export async function loadEngagementContext(
  request: Request
): Promise<{ ok: true; context: EngagementContext } | { ok: false; response: Response }> {
  const session = getAdminSessionFromRequest(request);
  if (!session) return { ok: false, response: unauthorizedAdminResponse() };
  if (session.isDemo) return { ok: false, response: denialResponse(denial("demo_session")) };

  try {
    const supabase = getServiceSupabase();
    const identity = await loadIdentity(supabase, session);
    if (!identity || identity.status !== "active") {
      return { ok: false, response: Response.json({ error: INACTIVE_MESSAGE, code: "forbidden" }, { status: 403 }) };
    }
    const db = createSupabaseEngagementDb(supabase);
    const [accessMap, managed] = await Promise.all([
      getUserAccessMap(supabase, [
        { id: identity.userId, email: identity.email, full_name: identity.name, role: identity.legacyRole }
      ]),
      loadManagedDepartments(db, identity.userId)
    ]);
    const access = accessMap[identity.userId];
    const actor = buildEngagementActor({
      identity,
      access,
      managedDepartments: managed.departments,
      impersonated: Boolean(session.impersonatorEmail)
    });
    return { ok: true, context: { session, supabase, db, actor, storageReady: managed.storageReady } };
  } catch (error) {
    return { ok: false, response: engagementErrorResponse(error) };
  }
}
