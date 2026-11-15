import { randomUUID } from "node:crypto";
import { assertCommunityText } from "@/lib/team-engagement/community-content";
import { multilineText, nowIso, optionalText, requireStorage, requireUuid, text, type ServiceContext } from "@/lib/team-engagement/context";
import { EngagementError, forbiddenError, validationError } from "@/lib/team-engagement/errors";
import type { EngagementTable } from "@/lib/team-engagement/types";

export const PACK_PHASE4_TABLES = [
  "team_engagement_pack_goal_participants",
  "team_engagement_would_you_rather",
  "team_engagement_would_you_rather_votes",
  "team_engagement_pack_events",
  "team_engagement_pack_event_rsvps",
  "team_engagement_team_pulse_responses",
  "team_engagement_voice_outcomes"
] as const;

export type PackPhase4Table = (typeof PACK_PHASE4_TABLES)[number];

export async function packPhase4Ready(ctx: ServiceContext): Promise<Record<PackPhase4Table, boolean>> {
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status) {
    return Object.fromEntries(PACK_PHASE4_TABLES.map((table) => [table, false])) as Record<PackPhase4Table, boolean>;
  }
  return Object.fromEntries(PACK_PHASE4_TABLES.map((table) => [table, status[table as EngagementTable] === true])) as Record<
    PackPhase4Table,
    boolean
  >;
}

function pacificTodayIso(ctx: ServiceContext): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ctx.now());
}

function weekStartMonday(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

async function assertPhase4(ctx: ServiceContext, table: PackPhase4Table) {
  const ready = await packPhase4Ready(ctx);
  if (!ready[table]) {
    throw new EngagementError(503, "setup_required", "Pack Phase 4 storage is not set up. Apply migration 109.");
  }
}

export async function joinPackGoal(ctx: ServiceContext, input: { goalId?: unknown }) {
  requireStorage(ctx);
  await assertPhase4(ctx, "team_engagement_pack_goal_participants");
  const goalId = requireUuid(input.goalId, "goalId");
  const { rows: existing } = await ctx.db.select("team_engagement_pack_goal_participants", {
    filters: [
      { column: "goal_id", op: "eq", value: goalId },
      { column: "participant_user_id", op: "eq", value: ctx.actor.userId }
    ],
    limit: 1
  });
  if (existing.length) return { joined: true, already: true };
  await ctx.db.commit([
    {
      op: "insert",
      table: "team_engagement_pack_goal_participants",
      values: {
        id: randomUUID(),
        goal_id: goalId,
        participant_user_id: ctx.actor.userId,
        participant_name: ctx.actor.name,
        joined_at: nowIso(ctx)
      }
    }
  ]);
  return { joined: true };
}

export async function teamPulseView(ctx: ServiceContext) {
  requireStorage(ctx);
  const ready = await packPhase4Ready(ctx);
  if (!ready.team_engagement_team_pulse_responses) {
    return { ready: false as const, weekStart: weekStartMonday(pacificTodayIso(ctx)), submitted: false };
  }
  const weekStart = weekStartMonday(pacificTodayIso(ctx));
  const { rows } = await ctx.db.select("team_engagement_team_pulse_responses", {
    filters: [
      { column: "responder_user_id", op: "eq", value: ctx.actor.userId },
      { column: "week_start", op: "eq", value: weekStart }
    ],
    limit: 1
  });
  return { ready: true as const, weekStart, submitted: rows.length > 0 };
}

export async function submitTeamPulse(
  ctx: ServiceContext,
  input: { workload?: unknown; support?: unknown; connection?: unknown; note?: unknown }
) {
  requireStorage(ctx);
  await assertPhase4(ctx, "team_engagement_team_pulse_responses");
  const workload = Number(input.workload);
  const support = Number(input.support);
  const connection = Number(input.connection);
  if (![workload, support, connection].every((n) => Number.isFinite(n) && n >= 1 && n <= 5)) {
    throw validationError("Rate workload, support, and connection from 1 to 5.");
  }
  const note = optionalText(input.note, 401);
  if (note) assertCommunityText(note, "voice");
  const weekStart = weekStartMonday(pacificTodayIso(ctx));
  const { rows: existing } = await ctx.db.select("team_engagement_team_pulse_responses", {
    filters: [
      { column: "responder_user_id", op: "eq", value: ctx.actor.userId },
      { column: "week_start", op: "eq", value: weekStart }
    ],
    limit: 1
  });
  if (existing.length) {
    throw new EngagementError(409, "duplicate", "You already submitted Team Pulse for this week.");
  }
  await ctx.db.commit([
    {
      op: "insert",
      table: "team_engagement_team_pulse_responses",
      values: {
        id: randomUUID(),
        responder_user_id: ctx.actor.userId,
        week_start: weekStart,
        workload_rating: workload,
        support_rating: support,
        connection_rating: connection,
        note: note ?? null,
        created_at: nowIso(ctx)
      }
    }
  ]);
  return teamPulseView(ctx);
}

export async function youSaidWeDidView(ctx: ServiceContext) {
  requireStorage(ctx);
  const ready = await packPhase4Ready(ctx);
  if (!ready.team_engagement_voice_outcomes) {
    return { ready: false as const, items: [] };
  }
  const { rows } = await ctx.db.select<{
    id: string;
    theme: string;
    management_response: string;
    action_taken: string | null;
    status: string;
    completed_at: string | null;
    published_at: string | null;
  }>("team_engagement_voice_outcomes", {
    filters: [{ column: "status", op: "neq", value: "archived" }],
    order: [{ column: "published_at", ascending: false }],
    limit: 30
  });
  const publicRows = rows.filter((row) => row.published_at);
  return {
    ready: true as const,
    items: publicRows.map((row) => ({
      id: row.id,
      theme: row.theme,
      managementResponse: row.management_response,
      actionTaken: row.action_taken,
      status: row.status,
      completedAt: row.completed_at
    }))
  };
}

export async function saveVoiceOutcome(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPhase4(ctx, "team_engagement_voice_outcomes");
  const theme = text(input.theme, 200);
  const managementResponse = multilineText(input.managementResponse, 2001);
  assertCommunityText(`${theme}\n${managementResponse}`, "voice");
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const publish = Boolean(input.publish);
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_voice_outcomes",
      conflict: ["id"],
      values: {
        id,
        theme: theme.trim(),
        management_response: managementResponse.trim(),
        action_taken: optionalText(input.actionTaken, 2001),
        status: publish ? "completed" : "in_progress",
        completed_at: publish ? now : null,
        published_at: publish ? now : null,
        created_by_user_id: ctx.actor.userId,
        created_at: now,
        updated_at: now
      }
    }
  ]);
  return { id };
}

export async function funZonePhase4View(ctx: ServiceContext) {
  if (!ctx.storageReady) {
    return { ready: false as const, wouldYouRather: null, events: [] as [] };
  }
  try {
  const ready = await packPhase4Ready(ctx);
  const now = nowIso(ctx);
  let wouldYouRather: null | {
    id: string;
    optionA: string;
    optionB: string;
    voted: boolean;
    choice: "a" | "b" | null;
    votesA: number;
    votesB: number;
  } = null;
  let events: Array<{
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    myRsvp: string | null;
    goingCount: number;
  }> = [];

  if (ready.team_engagement_would_you_rather) {
    const { rows } = await ctx.db.select<{
      id: string;
      option_a: string;
      option_b: string;
      status: string;
      publish_at: string | null;
      close_at: string | null;
    }>("team_engagement_would_you_rather", {
      filters: [{ column: "status", op: "eq", value: "active" }],
      limit: 5
    });
    const active = rows.find((row) => (!row.publish_at || row.publish_at <= now) && (!row.close_at || row.close_at >= now));
    if (active) {
      const { rows: votes } = await ctx.db.select<{ voter_user_id: string; choice: string }>(
        "team_engagement_would_you_rather_votes",
        { filters: [{ column: "question_id", op: "eq", value: active.id }], limit: 500 }
      );
      const mine = votes.find((v) => v.voter_user_id === ctx.actor.userId);
      wouldYouRather = {
        id: active.id,
        optionA: active.option_a,
        optionB: active.option_b,
        voted: Boolean(mine),
        choice: mine?.choice === "a" || mine?.choice === "b" ? mine.choice : null,
        votesA: votes.filter((v) => v.choice === "a").length,
        votesB: votes.filter((v) => v.choice === "b").length
      };
    }
  }

  if (ready.team_engagement_pack_events) {
    const { rows } = await ctx.db.select<{
      id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
    }>("team_engagement_pack_events", {
      filters: [{ column: "status", op: "eq", value: "published" }],
      order: [{ column: "starts_at", ascending: true }],
      limit: 10
    });
    for (const row of rows) {
      const { rows: rsvps } = await ctx.db.select<{ attendee_user_id: string; response: string }>(
        "team_engagement_pack_event_rsvps",
        { filters: [{ column: "event_id", op: "eq", value: row.id }], limit: 500 }
      );
      const mine = rsvps.find((r) => r.attendee_user_id === ctx.actor.userId);
      events.push({
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: row.starts_at,
        myRsvp: mine?.response ?? null,
        goingCount: rsvps.filter((r) => r.response === "going").length
      });
    }
  }

  return { ready: Object.values(ready).every(Boolean), wouldYouRather, events };
  } catch {
    return { ready: false as const, wouldYouRather: null, events: [] as [] };
  }
}

export async function voteWouldYouRather(ctx: ServiceContext, input: { questionId?: unknown; choice?: unknown }) {
  requireStorage(ctx);
  await assertPhase4(ctx, "team_engagement_would_you_rather_votes");
  const questionId = requireUuid(input.questionId, "questionId");
  const choice = input.choice === "b" ? "b" : input.choice === "a" ? "a" : null;
  if (!choice) throw validationError("Pick option A or B.");
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_would_you_rather_votes",
      conflict: ["question_id", "voter_user_id"],
      values: {
        id: randomUUID(),
        question_id: questionId,
        voter_user_id: ctx.actor.userId,
        choice,
        created_at: nowIso(ctx)
      }
    }
  ]);
  return funZonePhase4View(ctx);
}

export async function rsvpPackEvent(ctx: ServiceContext, input: { eventId?: unknown; response?: unknown }) {
  requireStorage(ctx);
  await assertPhase4(ctx, "team_engagement_pack_event_rsvps");
  const eventId = requireUuid(input.eventId, "eventId");
  const response = oneOfRsvp(input.response);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_pack_event_rsvps",
      conflict: ["event_id", "attendee_user_id"],
      values: {
        id: randomUUID(),
        event_id: eventId,
        attendee_user_id: ctx.actor.userId,
        attendee_name: ctx.actor.name,
        response,
        created_at: nowIso(ctx)
      }
    }
  ]);
  return funZonePhase4View(ctx);
}

function oneOfRsvp(value: unknown) {
  if (value === "going" || value === "maybe" || value === "cant") return value;
  throw validationError("Pick Going, Maybe, or Can't make it.");
}

export async function publishPackEvent(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPhase4(ctx, "team_engagement_pack_events");
  const title = text(input.title, 200);
  const description = multilineText(input.description, 2001);
  assertCommunityText(`${title}\n${description}`, "fun");
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_pack_events",
      conflict: ["id"],
      values: {
        id,
        title: title.trim(),
        description: description.trim(),
        location: optionalText(input.location, 201),
        starts_at: typeof input.startsAt === "string" ? input.startsAt : now,
        ends_at: typeof input.endsAt === "string" ? input.endsAt : null,
        status: "published",
        created_by_user_id: ctx.actor.userId,
        created_at: now,
        updated_at: now
      }
    }
  ]);
  return { id };
}

export async function publishWouldYouRather(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPhase4(ctx, "team_engagement_would_you_rather");
  const optionA = text(input.optionA, 200);
  const optionB = text(input.optionB, 200);
  assertCommunityText(`${optionA}\n${optionB}`, "fun");
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_would_you_rather",
      conflict: ["id"],
      values: {
        id,
        prompt: optionalText(input.prompt, 401),
        option_a: optionA.trim(),
        option_b: optionB.trim(),
        status: "active",
        publish_at: now,
        close_at: null,
        created_at: now,
        updated_at: now
      }
    }
  ]);
  return { id };
}