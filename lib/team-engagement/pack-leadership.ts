import { listFeedback } from "@/lib/team-engagement/records";
import { packGoalsEmployeeView, listPackGoalsLeadership } from "@/lib/team-engagement/pack-goals";
import { listVoiceSurveysLeadership } from "@/lib/team-engagement/employee-voice";
import {
  funZoneSetupMessage,
  funZoneStorageReady,
  funZoneView,
  milestonesView,
  packTablesReady
} from "@/lib/team-engagement/pack-features";
import { requireStorage, type ServiceContext } from "@/lib/team-engagement/context";
import { forbiddenError } from "@/lib/team-engagement/errors";
import type { EngagementTable } from "@/lib/team-engagement/types";

export async function funZoneManagementView(ctx: ServiceContext) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const zoneReady = await funZoneStorageReady(ctx);
  if (!zoneReady.ready) {
    return {
      ready: false as const,
      setupMessage: funZoneSetupMessage(),
      missingTables: zoneReady.missing,
      questions: [] as unknown[],
      polls: [] as unknown[],
      trivia: [] as unknown[]
    };
  }

  const tables: EngagementTable[] = [
    "team_engagement_fun_questions",
    "team_engagement_fun_polls",
    "team_engagement_fun_trivia"
  ];
  try {
  const [questions, polls, trivia] = await Promise.all(
    tables.map((table) =>
      ctx.db.select<Record<string, unknown>>(table, {
        order: [{ column: "updated_at", ascending: false }],
        limit: 30
      })
    )
  );
  return {
    ready: true as const,
    questions: questions.rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      status: row.status,
      publishAt: row.publish_at
    })),
    polls: polls.rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      status: row.status,
      publishAt: row.publish_at
    })),
    trivia: trivia.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      publishAt: row.publish_at
    }))
  };
  } catch {
    return {
      ready: false as const,
      setupMessage: funZoneSetupMessage(),
      missingTables: zoneReady.missing,
      questions: [],
      polls: [],
      trivia: []
    };
  }
}

export async function ideasManagementView(ctx: ServiceContext) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const { items } = await listFeedback(ctx, { status: "open" });
  const { rows: all } = await ctx.db.select<{ status: string }>("team_engagement_feedback", { limit: 5000 });
  const byStatus: Record<string, number> = {};
  for (const row of all) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  return {
    openCount: items.length,
    byStatus,
    recent: items.slice(0, 20).map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status,
      submitterName: row.submitter_name,
      createdAt: row.created_at,
      assignedToName: row.assigned_to_name
    }))
  };
}

export async function packEngagementOverview(ctx: ServiceContext) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const [goals, milestones, funZone, packReady, ideas, employeeGoals] = await Promise.all([
    listPackGoalsLeadership(ctx).catch(() => ({ items: [] })),
    milestonesView(ctx),
    funZoneView(ctx),
    packTablesReady(ctx),
    ideasManagementView(ctx).catch(() => null),
    packGoalsEmployeeView(ctx).catch(() => ({ active: [], completed: [] }))
  ]);
  const activeGoals = goals.items.filter((g) => g.status === "active");
  const completedGoals = goals.items.filter((g) => g.status === "completed");
  return {
    packStorage: packReady,
    goals: {
      active: activeGoals.length,
      completed: completedGoals.length,
      preview: employeeGoals.active.slice(0, 3)
    },
    milestones: {
      ready: milestones.ready,
      upcoming: milestones.ready ? milestones.upcoming.length : 0
    },
    funZone: {
      ready: funZone.ready,
      hasQuestion: Boolean(funZone.question),
      hasPoll: Boolean(funZone.poll)
    },
    ideas: ideas
      ? {
          open: ideas.openCount,
          byStatus: ideas.byStatus
        }
      : null
  };
}