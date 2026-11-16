import { randomUUID } from "node:crypto";
import {
  ENGAGEMENT_DEPARTMENTS,
  PACK_GOAL_STATUSES,
  PACK_GOAL_TYPE_ALIASES,
  PACK_GOAL_TYPES,
  type PackGoalStatus,
  type PackGoalType
} from "@/lib/team-engagement/constants";
import { auditOp, multilineText, nowIso, oneOf, optionalText, requireStorage, requireUuid, text, type ServiceContext } from "@/lib/team-engagement/context";
import { EngagementError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { scopeIncludesDepartments } from "@/lib/team-engagement/permissions";
import type { DbOp } from "@/lib/team-engagement/types";

type GoalRow = {
  id: string;
  title: string;
  description: string;
  goal_type: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  departments: string[];
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  success_criteria: string | null;
  published_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

async function assertGoalsTable(ctx: ServiceContext) {
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status?.team_engagement_pack_goals) {
    throw new EngagementError(503, "setup_required", "Pack Goals require migration 107.");
  }
}

function progressPercent(row: GoalRow) {
  if (row.target_value == null || row.target_value <= 0) {
    return row.status === "completed" ? 100 : 0;
  }
  return Math.min(100, Math.round((Number(row.current_value) / Number(row.target_value)) * 100));
}

function goalVisibleToEmployee(ctx: ServiceContext, row: GoalRow) {
  if (row.status !== "active" && row.status !== "completed") return false;
  if (!row.departments.length) return true;
  return scopeIncludesDepartments(ctx.actor.scope, row.departments) || ctx.actor.departments.some((d) => row.departments.includes(d));
}

/** Accepts DB goal types and template-library categories (teamwork, learning, …). */
export function normalizePackGoalType(raw: unknown): PackGoalType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((PACK_GOAL_TYPES as readonly string[]).includes(value)) {
    return value as PackGoalType;
  }
  const alias = PACK_GOAL_TYPE_ALIASES[value];
  if (alias) return alias;
  return "participation";
}

function mapGoal(row: GoalRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    goalType: row.goal_type,
    targetValue: row.target_value,
    currentValue: row.current_value,
    unit: row.unit,
    departments: row.departments,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    successCriteria: row.success_criteria,
    publishedAt: row.published_at,
    completedAt: row.completed_at,
    progressPercent: progressPercent(row)
  };
}

export async function packGoalsEmployeeView(ctx: ServiceContext) {
  requireStorage(ctx);
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status?.team_engagement_pack_goals) {
    return { ready: false as const, active: [], completed: [] };
  }
  const { rows } = await ctx.db.select<GoalRow>("team_engagement_pack_goals", {
    filters: [{ column: "status", op: "in", value: ["active", "completed"] }],
    order: [{ column: "ends_on", ascending: true }],
    limit: 50
  });
  const visible = rows.filter((row) => goalVisibleToEmployee(ctx, row));
  return {
    ready: true as const,
    active: visible.filter((row) => row.status === "active").map(mapGoal),
    completed: visible.filter((row) => row.status === "completed").map(mapGoal)
  };
}

export async function listPackGoalsLeadership(ctx: ServiceContext) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertGoalsTable(ctx);
  const { rows } = await ctx.db.select<GoalRow>("team_engagement_pack_goals", {
    order: [{ column: "updated_at", ascending: false }],
    limit: 100
  });
  const scoped = ctx.actor.scope.all ? rows : rows.filter((row) => !row.departments.length || scopeIncludesDepartments(ctx.actor.scope, row.departments));
  return { items: scoped.map(mapGoal) };
}

export async function savePackGoal(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertGoalsTable(ctx);
  const title = text(input.title, 160);
  const description = multilineText(input.description, 2000);
  if (title.length < 3) throw validationError("Add a goal title.");
  if (description.length < 10) throw validationError("Describe the goal in a few sentences.");
  const goalType = normalizePackGoalType(input.goalType);
  const targetValue =
    input.targetValue === null || input.targetValue === undefined || input.targetValue === ""
      ? null
      : Number(input.targetValue);
  if (targetValue !== null && (Number.isNaN(targetValue) || targetValue < 0)) throw validationError("Target must be a positive number.");
  const unit = optionalText(input.unit, 41);
  const departments = Array.isArray(input.departments)
    ? input.departments.filter((d): d is string => typeof d === "string" && (ENGAGEMENT_DEPARTMENTS as readonly string[]).includes(d))
    : [];
  const startsOn = input.startsOn ? String(input.startsOn).slice(0, 10) : null;
  const endsOn = input.endsOn ? String(input.endsOn).slice(0, 10) : null;
  const successCriteria = optionalText(input.successCriteria, 601);
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_pack_goals",
      conflict: ["id"],
      values: {
        id,
        title: title.trim(),
        description: description.trim(),
        goal_type: goalType,
        target_value: targetValue,
        current_value: 0,
        unit,
        departments,
        status: "draft",
        starts_on: startsOn,
        ends_on: endsOn,
        success_criteria: successCriteria,
        created_by_user_id: ctx.actor.userId,
        created_by_name: ctx.actor.name,
        created_at: now,
        updated_at: now
      }
    },
    {
      op: "insert",
      table: "team_engagement_pack_goal_events",
      values: {
        id: randomUUID(),
        goal_id: id,
        event_type: "created",
        actor_user_id: ctx.actor.userId,
        actor_name: ctx.actor.name,
        created_at: now
      }
    }
  ]);
  return { id };
}

export async function publishPackGoal(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_pack_goals",
      match: { id },
      set: { status: "active", published_at: now, updated_at: now },
      expectRows: 1
    },
    {
      op: "insert",
      table: "team_engagement_pack_goal_events",
      values: {
        id: randomUUID(),
        goal_id: id,
        event_type: "published",
        actor_user_id: ctx.actor.userId,
        actor_name: ctx.actor.name,
        created_at: now
      }
    }
  ]);
  return { id };
}

export async function updatePackGoalProgress(ctx: ServiceContext, input: { id?: unknown; currentValue?: unknown; note?: unknown; complete?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const { rows } = await ctx.db.select<GoalRow>("team_engagement_pack_goals", { filters: [{ column: "id", op: "eq", value: id }], limit: 1 });
  const row = rows[0];
  if (!row) throw notFoundError("Goal");
  const currentValue = input.currentValue === undefined ? row.current_value : Number(input.currentValue);
  if (Number.isNaN(currentValue) || currentValue < 0) throw validationError("Progress must be zero or higher.");
  const note = optionalText(input.note, 501);
  const now = nowIso(ctx);
  let status: PackGoalStatus = row.status as PackGoalStatus;
  let completedAt = row.completed_at;
  if (input.complete === true || (row.target_value != null && currentValue >= row.target_value)) {
    status = "completed";
    completedAt = now;
  }
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_pack_goals",
      match: { id },
      set: { current_value: currentValue, status, completed_at: completedAt, updated_at: now },
      expectRows: 1
    },
    {
      op: "insert",
      table: "team_engagement_pack_goal_events",
      values: {
        id: randomUUID(),
        goal_id: id,
        event_type: status === "completed" ? "completed" : "progress",
        previous_value: row.current_value,
        new_value: currentValue,
        note,
        actor_user_id: ctx.actor.userId,
        actor_name: ctx.actor.name,
        created_at: now
      }
    },
    auditOp(ctx, {
      category: "engagement",
      action: "pack_goal.progress",
      targetType: "pack_goal",
      targetId: id,
      targetLabel: row.title
    })
  ]);
  if (status === "completed") {
    try {
      const directory = await ctx.directory();
      for (const employee of directory.employees) {
        if (!employee.active) continue;
        if (row.departments.length && !employee.departments.some((d) => row.departments.includes(d))) continue;
        await ctx.notify({
          recipientUserId: employee.userId,
          title: "Pack goal completed",
          body: `The team reached “${row.title}”.`,
          dedupeKey: `pack_goal:${id}:completed`
        });
      }
    } catch {
      // Best-effort celebration notices.
    }
  }
  return { id, status, currentValue };
}

export async function archivePackGoal(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_pack_goals",
      match: { id },
      set: { status: "archived", updated_at: now },
      expectRows: 1
    },
    {
      op: "insert",
      table: "team_engagement_pack_goal_events",
      values: {
        id: randomUUID(),
        goal_id: id,
        event_type: "archived",
        actor_user_id: ctx.actor.userId,
        actor_name: ctx.actor.name,
        created_at: now
      }
    }
  ]);
  return { id };
}