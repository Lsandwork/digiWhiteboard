import { randomUUID } from "node:crypto";
import { barkOutViews, type BarkOutView } from "@/lib/team-engagement/bark-outs";
import {
  BARK_OUT_COMMENT_MAX,
  MILESTONE_MESSAGE_MAX,
  SPOTLIGHT_CATEGORIES,
  SPOTLIGHT_CATEGORY_LABELS,
  type SpotlightCategory
} from "@/lib/team-engagement/constants";
import { PACK_PRIORITY2_COMMIT, PACK_PRIORITY2_MIGRATION } from "@/lib/team-engagement/constants";
import {
  multilineText,
  nowIso,
  requireStorage,
  requireUuid,
  text,
  type ServiceContext
} from "@/lib/team-engagement/context";
import { assertCommunityText } from "@/lib/team-engagement/community-content";
import { EngagementError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import type { BarkOutRow, DbOp } from "@/lib/team-engagement/types";

export const PACK_OPTIONAL_TABLES = [
  "team_engagement_bark_out_comments",
  "team_engagement_milestones",
  "team_engagement_fun_questions",
  "team_engagement_fun_polls",
  "team_engagement_fun_trivia",
  "team_engagement_spotlights"
] as const;

/** Every table Fun Zone reads (Pack + Manage must agree on this list). */
export const FUN_ZONE_READ_TABLES = [
  "team_engagement_fun_questions",
  "team_engagement_fun_question_responses",
  "team_engagement_fun_polls",
  "team_engagement_fun_poll_options",
  "team_engagement_fun_poll_votes",
  "team_engagement_fun_trivia",
  "team_engagement_fun_trivia_answers"
] as const;

export function funZoneSetupMessage() {
  return `Run ${PACK_PRIORITY2_MIGRATION} and ${PACK_PRIORITY2_COMMIT} in Supabase (after migration 103), then refresh.`;
}

export async function funZoneStorageReady(ctx: ServiceContext) {
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status) return { ready: false as const, missing: [...FUN_ZONE_READ_TABLES] };
  const missing = FUN_ZONE_READ_TABLES.filter((table) => !status[table]);
  return { ready: missing.length === 0, missing };
}

export const EMPTY_FUN_ZONE_VIEW = {
  ready: false as const,
  question: null,
  poll: null,
  trivia: null,
  setupMessage: funZoneSetupMessage()
};

type PackOptionalTable = (typeof PACK_OPTIONAL_TABLES)[number];

export async function packTablesReady(ctx: ServiceContext): Promise<Record<PackOptionalTable, boolean>> {
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status) {
    return Object.fromEntries(PACK_OPTIONAL_TABLES.map((table) => [table, false])) as Record<PackOptionalTable, boolean>;
  }
  return Object.fromEntries(PACK_OPTIONAL_TABLES.map((table) => [table, status[table] === true])) as Record<
    PackOptionalTable,
    boolean
  >;
}

async function assertPackTable(ctx: ServiceContext, table: PackOptionalTable) {
  const ready = await packTablesReady(ctx);
  if (!ready[table]) {
    throw new EngagementError(503, "setup_required", "Pack Priority 2 storage is not set up yet. Apply migration 105.");
  }
}

async function notifySafely(ctx: ServiceContext, notification: Parameters<ServiceContext["notify"]>[0]) {
  try {
    await ctx.notify(notification);
  } catch {
    // Best-effort.
  }
}

function pacificTodayIso(ctx: ServiceContext): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ctx.now());
  return parts;
}

function weekStartMonday(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

type CommentRow = {
  id: string;
  bark_out_id: string;
  parent_comment_id: string | null;
  author_user_id: string | null;
  author_name: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type BarkOutCommentView = {
  id: string;
  barkOutId: string;
  parentCommentId: string | null;
  author: { userId: string | null; name: string; avatarUrl: string | null };
  body: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

function commentView(ctx: ServiceContext, row: CommentRow, avatars: Map<string, string | null>): BarkOutCommentView {
  const mine = row.author_user_id === ctx.actor.userId;
  const mod = ctx.actor.permissions.includes("engagement.moderate");
  return {
    id: row.id,
    barkOutId: row.bark_out_id,
    parentCommentId: row.parent_comment_id,
    author: {
      userId: row.author_user_id,
      name: row.author_name,
      avatarUrl: row.author_user_id ? avatars.get(row.author_user_id) ?? null : null
    },
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit: mine && row.status === "active",
    canDelete: (mine || mod) && row.status === "active"
  };
}

async function publishedBarkOut(ctx: ServiceContext, barkOutId: string): Promise<BarkOutRow> {
  const { rows } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters: [
      { column: "id", op: "eq", value: barkOutId },
      { column: "status", op: "eq", value: "published" }
    ],
    limit: 1
  });
  if (!rows[0]) throw notFoundError("Bark Out");
  return rows[0];
}

export async function commentCounts(ctx: ServiceContext, barkOutIds: string[]) {
  if (!barkOutIds.length) return new Map<string, number>();
  const ready = await packTablesReady(ctx);
  if (!ready.team_engagement_bark_out_comments) return new Map<string, number>();
  const { rows } = await ctx.db.select<{ bark_out_id: string }>("team_engagement_bark_out_comments", {
    filters: [
      { column: "bark_out_id", op: "in", value: barkOutIds },
      { column: "status", op: "eq", value: "active" }
    ],
    limit: 5000
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.bark_out_id, (counts.get(row.bark_out_id) ?? 0) + 1);
  return counts;
}

export async function listBarkOutComments(ctx: ServiceContext, input: { barkOutId?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_bark_out_comments");
  const barkOutId = requireUuid(input.barkOutId, "barkOutId");
  await publishedBarkOut(ctx, barkOutId);
  const { rows } = await ctx.db.select<CommentRow>("team_engagement_bark_out_comments", {
    filters: [
      { column: "bark_out_id", op: "eq", value: barkOutId },
      { column: "status", op: "eq", value: "active" }
    ],
    order: [{ column: "created_at", ascending: true }],
    limit: 200
  });
  const avatarIds = rows.map((row) => row.author_user_id).filter(Boolean) as string[];
  const avatars = new Map(
    await Promise.all(avatarIds.map(async (id) => [id, await ctx.loadAvatar(id)] as const))
  );
  return { items: rows.map((row) => commentView(ctx, row, avatars)) };
}

export async function createBarkOutComment(
  ctx: ServiceContext,
  input: { barkOutId?: unknown; body?: unknown; parentCommentId?: unknown }
) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_bark_out_comments");
  const barkOutId = requireUuid(input.barkOutId, "barkOutId");
  const barkOut = await publishedBarkOut(ctx, barkOutId);
  const body = multilineText(input.body, BARK_OUT_COMMENT_MAX + 1);
  if (!body.trim()) throw validationError("Say something in your comment.");
  assertCommunityText(body, "comment");
  if (body.length > BARK_OUT_COMMENT_MAX) throw validationError(`Keep comments under ${BARK_OUT_COMMENT_MAX} characters.`);

  let parent: CommentRow | null = null;
  if (input.parentCommentId) {
    const parentId = requireUuid(input.parentCommentId, "parentCommentId");
    const { rows } = await ctx.db.select<CommentRow>("team_engagement_bark_out_comments", {
      filters: [
        { column: "id", op: "eq", value: parentId },
        { column: "bark_out_id", op: "eq", value: barkOutId },
        { column: "status", op: "eq", value: "active" }
      ],
      limit: 1
    });
    parent = rows[0] ?? null;
    if (!parent) throw validationError("That reply target is no longer available.");
  }

  const now = nowIso(ctx);
  const id = randomUUID();
  const ops: DbOp[] = [
    {
      op: "insert",
      table: "team_engagement_bark_out_comments",
      values: {
        id,
        bark_out_id: barkOutId,
        parent_comment_id: parent?.id ?? null,
        author_user_id: ctx.actor.userId,
        author_name: ctx.actor.name,
        body: body.trim(),
        status: "active",
        created_at: now,
        updated_at: now
      }
    }
  ];
  await ctx.db.commit(ops);

  if (barkOut.author_user_id && barkOut.author_user_id !== ctx.actor.userId) {
    await notifySafely(ctx, {
      recipientUserId: barkOut.author_user_id,
      title: `${ctx.actor.name} commented on your Bark Out`,
      body: body.slice(0, 160),
      dedupeKey: `bark_out_comment:${id}:author`
    });
  }
  if (parent?.author_user_id && parent.author_user_id !== ctx.actor.userId) {
    await notifySafely(ctx, {
      recipientUserId: parent.author_user_id,
      title: `${ctx.actor.name} replied to your comment`,
      body: body.slice(0, 160),
      dedupeKey: `bark_out_comment:${id}:parent`
    });
  }
  if (barkOut.recipient_user_id && barkOut.recipient_user_id !== ctx.actor.userId && barkOut.recipient_user_id !== barkOut.author_user_id) {
    await notifySafely(ctx, {
      recipientUserId: barkOut.recipient_user_id,
      title: `${ctx.actor.name} joined the conversation on your Bark Out`,
      body: body.slice(0, 160),
      dedupeKey: `bark_out_comment:${id}:recipient`
    });
  }

  return listBarkOutComments(ctx, { barkOutId });
}

export async function editBarkOutComment(ctx: ServiceContext, input: { id?: unknown; body?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_bark_out_comments");
  const id = requireUuid(input.id, "id");
  const body = multilineText(input.body, BARK_OUT_COMMENT_MAX + 1);
  if (!body.trim()) throw validationError("Comment cannot be empty.");
  if (body.length > BARK_OUT_COMMENT_MAX) throw validationError(`Keep comments under ${BARK_OUT_COMMENT_MAX} characters.`);
  assertCommunityText(body, "comment");
  const { rows } = await ctx.db.select<CommentRow>("team_engagement_bark_out_comments", {
    filters: [{ column: "id", op: "eq", value: id }, { column: "status", op: "eq", value: "active" }],
    limit: 1
  });
  const row = rows[0];
  if (!row) throw notFoundError("Comment");
  if (row.author_user_id !== ctx.actor.userId) throw forbiddenError();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_bark_out_comments",
      match: { id },
      set: { body: body.trim(), updated_at: now },
      expectRows: 1
    }
  ]);
  return listBarkOutComments(ctx, { barkOutId: row.bark_out_id });
}

export async function deleteBarkOutComment(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_bark_out_comments");
  const id = requireUuid(input.id, "id");
  const mod = ctx.actor.permissions.includes("engagement.moderate");
  const { rows } = await ctx.db.select<CommentRow>("team_engagement_bark_out_comments", {
    filters: [{ column: "id", op: "eq", value: id }, { column: "status", op: "eq", value: "active" }],
    limit: 1
  });
  const row = rows[0];
  if (!row) throw notFoundError("Comment");
  if (row.author_user_id !== ctx.actor.userId && !mod) throw forbiddenError();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_bark_out_comments",
      match: { id },
      set: { status: mod && row.author_user_id !== ctx.actor.userId ? "removed" : "deleted", updated_at: now },
      expectRows: 1
    }
  ]);
  return listBarkOutComments(ctx, { barkOutId: row.bark_out_id });
}

type MilestoneRow = {
  id: string;
  employee_user_id: string | null;
  employee_name: string;
  kind: string;
  title: string;
  summary: string | null;
  celebration_on: string;
  visibility: string;
  status: string;
  created_at: string;
};

export async function milestonesView(ctx: ServiceContext) {
  requireStorage(ctx);
  const ready = await packTablesReady(ctx);
  if (!ready.team_engagement_milestones) {
    return { ready: false as const, upcoming: [], recent: [] };
  }
  const today = pacificTodayIso(ctx);
  const { rows } = await ctx.db.select<MilestoneRow>("team_engagement_milestones", {
    filters: [{ column: "status", op: "eq", value: "active" }],
    order: [{ column: "celebration_on", ascending: true }],
    limit: 80
  });
  const visible = rows.filter((row) => row.visibility !== "private" || row.employee_user_id === ctx.actor.userId);
  const upcoming = visible.filter((row) => row.celebration_on >= today).slice(0, 20);
  const recent = visible.filter((row) => row.celebration_on < today).slice(-20).reverse();
  const avatars = new Map(
    await Promise.all(
      [...new Set(visible.map((row) => row.employee_user_id).filter(Boolean))].map(
        async (id) => [id as string, await ctx.loadAvatar(id as string)] as const
      )
    )
  );
  const mapItem = (row: MilestoneRow) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    celebrationOn: row.celebration_on,
    employee: {
      userId: row.employee_user_id,
      name: row.employee_name,
      avatarUrl: row.employee_user_id ? avatars.get(row.employee_user_id) ?? null : null
    }
  });
  return { ready: true as const, upcoming: upcoming.map(mapItem), recent: recent.map(mapItem) };
}

export async function congratulateMilestone(ctx: ServiceContext, input: { milestoneId?: unknown; body?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_milestones");
  const milestoneId = requireUuid(input.milestoneId, "milestoneId");
  const message = multilineText(input.body, MILESTONE_MESSAGE_MAX + 1);
  if (!message.trim()) throw validationError("Add a short congratulation.");
  if (message.length > MILESTONE_MESSAGE_MAX) throw validationError(`Keep messages under ${MILESTONE_MESSAGE_MAX} characters.`);
  assertCommunityText(message, "milestone");
  const { rows } = await ctx.db.select<MilestoneRow>("team_engagement_milestones", {
    filters: [{ column: "id", op: "eq", value: milestoneId }, { column: "status", op: "eq", value: "active" }],
    limit: 1
  });
  if (!rows[0]) throw notFoundError("Milestone");
  await ctx.db.commit([
    {
      op: "insert",
      table: "team_engagement_milestone_messages",
      values: {
        id: randomUUID(),
        milestone_id: milestoneId,
        author_user_id: ctx.actor.userId,
        author_name: ctx.actor.name,
        body: message.trim(),
        created_at: nowIso(ctx)
      }
    }
  ]);
  if (rows[0].employee_user_id && rows[0].employee_user_id !== ctx.actor.userId) {
    await notifySafely(ctx, {
      recipientUserId: rows[0].employee_user_id,
      title: `${ctx.actor.name} celebrated your milestone`,
      body: message.slice(0, 160),
      dedupeKey: `milestone_msg:${milestoneId}:${ctx.actor.userId}:${nowIso(ctx).slice(0, 10)}`
    });
  }
  return { ok: true as const };
}

type FunQuestionRow = {
  id: string;
  prompt: string;
  status: string;
  publish_at: string | null;
  close_at: string | null;
  allow_multiple_responses: boolean;
};

type FunPollRow = {
  id: string;
  prompt: string;
  status: string;
  allow_multiple: boolean;
  allow_vote_change: boolean;
  hide_results_until_vote: boolean;
  publish_at: string | null;
  close_at: string | null;
};

function activityActive(row: { status: string; publish_at: string | null; close_at: string | null }, now: string) {
  if (row.status !== "active") return false;
  if (row.publish_at && row.publish_at > now) return false;
  if (row.close_at && row.close_at < now) return false;
  return true;
}

export async function funZoneView(ctx: ServiceContext) {
  if (!ctx.storageReady) {
    return { ...EMPTY_FUN_ZONE_VIEW, setupMessage: "Apply migration 103 for core Team Engagement storage, then run the Pack Priority 2 migrations." };
  }
  const zoneReady = await funZoneStorageReady(ctx);
  const now = nowIso(ctx);
  if (!zoneReady.ready) {
    return { ready: false as const, question: null, poll: null, trivia: null, setupMessage: funZoneSetupMessage() };
  }
  try {
  const [{ rows: questions }, { rows: polls }, triviaReady] = await Promise.all([
    ctx.db.select<FunQuestionRow>("team_engagement_fun_questions", {
      filters: [{ column: "status", op: "in", value: ["active", "scheduled"] }],
      order: [{ column: "publish_at", ascending: false }],
      limit: 20
    }),
    ctx.db.select<FunPollRow>("team_engagement_fun_polls", {
      filters: [{ column: "status", op: "in", value: ["active", "scheduled"] }],
      order: [{ column: "publish_at", ascending: false }],
      limit: 20
    }),
    packTablesReady(ctx).then((s) => s.team_engagement_fun_trivia)
  ]);

  const question = questions.find((row) => activityActive(row, now)) ?? null;
  let questionPayload: null | {
    id: string;
    prompt: string;
    responded: boolean;
    responseCount: number;
    responsesVisible: boolean;
  } = null;
  if (question) {
    const { rows: responses, total } = await ctx.db.select<{ responder_user_id: string; body: string }>(
      "team_engagement_fun_question_responses",
      {
        filters: [{ column: "question_id", op: "eq", value: question.id }],
        limit: 500,
        count: true
      }
    );
    const mine = responses.find((row) => row.responder_user_id === ctx.actor.userId);
    questionPayload = {
      id: question.id,
      prompt: question.prompt,
      responded: Boolean(mine),
      responseCount: total ?? responses.length,
      responsesVisible: Boolean(mine) || !question.allow_multiple_responses
    };
  }

  const poll = polls.find((row) => activityActive(row, now)) ?? null;
  let pollPayload: null | {
    id: string;
    prompt: string;
    allowMultiple: boolean;
    allowVoteChange: boolean;
    hideResultsUntilVote: boolean;
    options: { id: string; label: string; votes: number; selected: boolean }[];
    voted: boolean;
    totalVotes: number;
  } = null;
  if (poll) {
    const { rows: options } = await ctx.db.select<{ id: string; label: string; sort_order: number }>(
      "team_engagement_fun_poll_options",
      {
        filters: [{ column: "poll_id", op: "eq", value: poll.id }],
        order: [{ column: "sort_order", ascending: true }],
        limit: 20
      }
    );
    const { rows: votes } = await ctx.db.select<{ option_id: string; voter_user_id: string }>("team_engagement_fun_poll_votes", {
      filters: [{ column: "poll_id", op: "eq", value: poll.id }],
      limit: 2000
    });
    const myVotes = new Set(votes.filter((row) => row.voter_user_id === ctx.actor.userId).map((row) => row.option_id));
    const counts = new Map<string, number>();
    for (const vote of votes) counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);
    const totalVotes = votes.length;
    const showResults = !poll.hide_results_until_vote || myVotes.size > 0;
    pollPayload = {
      id: poll.id,
      prompt: poll.prompt,
      allowMultiple: poll.allow_multiple,
      allowVoteChange: poll.allow_vote_change,
      hideResultsUntilVote: poll.hide_results_until_vote,
      voted: myVotes.size > 0,
      totalVotes,
      options: options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: showResults ? counts.get(option.id) ?? 0 : 0,
        selected: myVotes.has(option.id)
      }))
    };
  }

  let triviaPayload: null | { id: string; title: string; prompt: string; answered: boolean } = null;
  if (triviaReady) {
    const { rows: triviaRows } = await ctx.db.select<{ id: string; title: string; prompt: string; status: string; publish_at: string | null; close_at: string | null }>(
      "team_engagement_fun_trivia",
      { filters: [{ column: "status", op: "eq", value: "active" }], limit: 5 }
    );
    const trivia = triviaRows.find((row) => activityActive(row, now));
    if (trivia) {
      const { rows: answers } = await ctx.db.select("team_engagement_fun_trivia_answers", {
        filters: [
          { column: "trivia_id", op: "eq", value: trivia.id },
          { column: "responder_user_id", op: "eq", value: ctx.actor.userId }
        ],
        limit: 1
      });
      triviaPayload = { id: trivia.id, title: trivia.title, prompt: trivia.prompt, answered: answers.length > 0 };
    }
  }

  return { ready: true as const, question: questionPayload, poll: pollPayload, trivia: triviaPayload };
  } catch (error) {
    if (error instanceof EngagementError) {
      const setupMessage =
        error.code === "setup_required"
          ? funZoneSetupMessage()
          : "Fun Zone could not load from storage. Run migrations 105 and 106 in Supabase, then refresh.";
      return { ready: false as const, question: null, poll: null, trivia: null, setupMessage };
    }
    throw error;
  }
}

export async function answerFunQuestion(ctx: ServiceContext, input: { questionId?: unknown; body?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_fun_questions");
  const questionId = requireUuid(input.questionId, "questionId");
  const body = multilineText(input.body, 600);
  if (!body.trim()) throw validationError("Share your answer.");
  assertCommunityText(body, "fun");
  const { rows } = await ctx.db.select<FunQuestionRow>("team_engagement_fun_questions", {
    filters: [{ column: "id", op: "eq", value: questionId }],
    limit: 1
  });
  const question = rows[0];
  if (!question || !activityActive(question, nowIso(ctx))) throw validationError("That question is not open right now.");
  const { rows: existing } = await ctx.db.select("team_engagement_fun_question_responses", {
    filters: [
      { column: "question_id", op: "eq", value: questionId },
      { column: "responder_user_id", op: "eq", value: ctx.actor.userId }
    ],
    limit: 1
  });
  if (existing.length && !question.allow_multiple_responses) {
    throw new EngagementError(409, "duplicate", "You already answered this question.");
  }
  await ctx.db.commit([
    {
      op: "insert",
      table: "team_engagement_fun_question_responses",
      values: {
        id: randomUUID(),
        question_id: questionId,
        responder_user_id: ctx.actor.userId,
        responder_name: ctx.actor.name,
        body: body.trim(),
        created_at: nowIso(ctx)
      }
    }
  ]);
  return funZoneView(ctx);
}

export async function voteFunPoll(ctx: ServiceContext, input: { pollId?: unknown; optionIds?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_fun_polls");
  const pollId = requireUuid(input.pollId, "pollId");
  const optionIds = Array.isArray(input.optionIds)
    ? input.optionIds.map((value) => requireUuid(value, "optionId"))
    : [];
  if (!optionIds.length) throw validationError("Pick at least one option.");
  const { rows } = await ctx.db.select<FunPollRow>("team_engagement_fun_polls", {
    filters: [{ column: "id", op: "eq", value: pollId }],
    limit: 1
  });
  const poll = rows[0];
  if (!poll || !activityActive(poll, nowIso(ctx))) throw validationError("That poll is not open right now.");
  if (!poll.allow_multiple && optionIds.length > 1) throw validationError("This poll allows one choice.");
  const { rows: options } = await ctx.db.select<{ id: string }>("team_engagement_fun_poll_options", {
    filters: [{ column: "poll_id", op: "eq", value: pollId }],
    limit: 20
  });
  const allowed = new Set(options.map((row) => row.id));
  if (!optionIds.every((id) => allowed.has(id))) throw validationError("Invalid poll option.");

  const { rows: prior } = await ctx.db.select<{ id: string }>("team_engagement_fun_poll_votes", {
    filters: [
      { column: "poll_id", op: "eq", value: pollId },
      { column: "voter_user_id", op: "eq", value: ctx.actor.userId }
    ],
    limit: 5
  });
  if (prior.length && !poll.allow_vote_change) throw new EngagementError(409, "duplicate", "You already voted in this poll.");

  const ops: DbOp[] = [];
  if (prior.length) {
    ops.push({
      op: "delete",
      table: "team_engagement_fun_poll_votes",
      match: { poll_id: pollId, voter_user_id: ctx.actor.userId },
      expectRows: prior.length
    });
  }
  const now = nowIso(ctx);
  for (const optionId of optionIds) {
    ops.push({
      op: "insert",
      table: "team_engagement_fun_poll_votes",
      values: {
        id: randomUUID(),
        poll_id: pollId,
        option_id: optionId,
        voter_user_id: ctx.actor.userId,
        created_at: now,
        updated_at: now
      }
    });
  }
  await ctx.db.commit(ops);
  return funZoneView(ctx);
}

export async function answerFunTrivia(ctx: ServiceContext, input: { triviaId?: unknown; answer?: unknown }) {
  requireStorage(ctx);
  await assertPackTable(ctx, "team_engagement_fun_trivia");
  const triviaId = requireUuid(input.triviaId, "triviaId");
  const answer = text(input.answer, 200);
  if (!answer.trim()) throw validationError("Enter an answer.");
  const { rows } = await ctx.db.select<{ id: string; answer_key: string; status: string; publish_at: string | null; close_at: string | null }>(
    "team_engagement_fun_trivia",
    { filters: [{ column: "id", op: "eq", value: triviaId }], limit: 1 }
  );
  const trivia = rows[0];
  if (!trivia || !activityActive(trivia, nowIso(ctx))) throw validationError("That trivia activity is not open.");
  const { rows: existing } = await ctx.db.select("team_engagement_fun_trivia_answers", {
    filters: [
      { column: "trivia_id", op: "eq", value: triviaId },
      { column: "responder_user_id", op: "eq", value: ctx.actor.userId }
    ],
    limit: 1
  });
  if (existing.length) throw new EngagementError(409, "duplicate", "You already answered this trivia prompt.");
  const correct = answer.trim().toLowerCase() === trivia.answer_key.trim().toLowerCase();
  await ctx.db.commit([
    {
      op: "insert",
      table: "team_engagement_fun_trivia_answers",
      values: {
        id: randomUUID(),
        trivia_id: triviaId,
        responder_user_id: ctx.actor.userId,
        answer: answer.trim(),
        correct,
        created_at: nowIso(ctx)
      }
    }
  ]);
  const zone = await funZoneView(ctx);
  return { correct, ...zone };
}

type SpotlightRow = {
  id: string;
  bark_out_id: string;
  category: string;
  caption: string | null;
  week_start: string;
  active: boolean;
};

export async function resolvePackSpotlight(ctx: ServiceContext, fallback: BarkOutView | null) {
  const ready = await packTablesReady(ctx);
  if (!ready.team_engagement_spotlights) return { barkOut: fallback, curated: null as null | { category: string; caption: string | null } };
  const week = weekStartMonday(pacificTodayIso(ctx));
  const { rows } = await ctx.db.select<SpotlightRow>("team_engagement_spotlights", {
    filters: [
      { column: "week_start", op: "eq", value: week },
      { column: "active", op: "eq", value: true }
    ],
    limit: 1
  });
  const spotlight = rows[0];
  if (!spotlight) return { barkOut: fallback, curated: null };
  const { rows: barkRows } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters: [{ column: "id", op: "eq", value: spotlight.bark_out_id }, { column: "status", op: "eq", value: "published" }],
    limit: 1
  });
  if (!barkRows[0]) return { barkOut: fallback, curated: null };
  const [view] = await barkOutViews(ctx, [barkRows[0]]);
  return {
    barkOut: view ?? fallback,
    curated: {
      category: SPOTLIGHT_CATEGORY_LABELS[spotlight.category as SpotlightCategory] ?? spotlight.category,
      caption: spotlight.caption
    }
  };
}

export async function featureSpotlight(
  ctx: ServiceContext,
  input: { barkOutId?: unknown; category?: unknown; caption?: unknown; weekStart?: unknown }
) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPackTable(ctx, "team_engagement_spotlights");
  const barkOutId = requireUuid(input.barkOutId, "barkOutId");
  await publishedBarkOut(ctx, barkOutId);
  const category = text(input.category, 64);
  if (!(SPOTLIGHT_CATEGORIES as readonly string[]).includes(category)) throw validationError("Choose a spotlight category.");
  const caption = input.caption == null || input.caption === "" ? null : multilineText(input.caption, 301);
  const week =
    typeof input.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)
      ? input.weekStart
      : weekStartMonday(pacificTodayIso(ctx));

  const { rows: existing } = await ctx.db.select<SpotlightRow>("team_engagement_spotlights", {
    filters: [{ column: "week_start", op: "eq", value: week }, { column: "active", op: "eq", value: true }],
    limit: 1
  });

  const now = nowIso(ctx);
  const ops: DbOp[] = [];
  if (existing[0]) {
    ops.push({
      op: "update",
      table: "team_engagement_spotlights",
      match: { id: existing[0].id },
      set: { active: false },
      expectRows: 1
    });
  }
  ops.push({
    op: "insert",
    table: "team_engagement_spotlights",
    values: {
      id: randomUUID(),
      bark_out_id: barkOutId,
      category,
      caption,
      week_start: week,
      featured_by_user_id: ctx.actor.userId,
      featured_by_name: ctx.actor.name,
      active: true,
      created_at: now
    }
  });
  await ctx.db.commit(ops);
  return { weekStart: week };
}

export async function clearSpotlight(ctx: ServiceContext, input: { weekStart?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPackTable(ctx, "team_engagement_spotlights");
  const week =
    typeof input.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)
      ? input.weekStart
      : weekStartMonday(pacificTodayIso(ctx));
  const { rows } = await ctx.db.select<SpotlightRow>("team_engagement_spotlights", {
    filters: [{ column: "week_start", op: "eq", value: week }, { column: "active", op: "eq", value: true }],
    limit: 1
  });
  if (!rows[0]) return { cleared: false };
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_spotlights",
      match: { id: rows[0].id },
      set: { active: false },
      expectRows: 1
    }
  ]);
  return { cleared: true };
}

export type StaffHrRow = {
  admin_user_id: string | null;
  name: string;
  hire_date: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  show_birthday: boolean;
};

const ANNIVERSARY_KINDS: { months: number; kind: string; title: (years: number) => string }[] = [
  { months: 6, kind: "anniversary_6mo", title: () => "Six months strong" },
  { months: 12, kind: "anniversary_1y", title: () => "One year with the Pack" },
  { months: 24, kind: "anniversary_2y", title: () => "Two years strong" },
  { months: 36, kind: "anniversary_3y", title: () => "Three dedicated years" },
  { months: 60, kind: "anniversary_5y", title: () => "Five years of impact" },
  { months: 120, kind: "anniversary_10y", title: () => "A decade with Fitdog" }
];

function addMonthsIso(hireDate: string, months: number): string {
  const [y, m, d] = hireDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

export async function syncPackMilestonesCore(input: {
  db: ServiceContext["db"];
  staff: StaffHrRow[];
  directory: Awaited<ReturnType<ServiceContext["directory"]>>;
  now?: () => Date;
}) {
  const ctxLike = { now: input.now ?? (() => new Date()) } as ServiceContext;
  const today = pacificTodayIso(ctxLike);
  const ops: DbOp[] = [];
  const now = nowIso(ctxLike);

  for (const member of input.staff) {
    if (!member.admin_user_id || !member.hire_date) continue;
    const employee = input.directory.byId.get(member.admin_user_id);
    if (!employee?.active) continue;
    for (const rule of ANNIVERSARY_KINDS) {
      const celebrationOn = addMonthsIso(member.hire_date, rule.months);
      if (celebrationOn > today) continue;
      ops.push({
        op: "upsert",
        table: "team_engagement_milestones",
        conflict: ["employee_user_id", "kind", "celebration_on"],
        values: {
          id: randomUUID(),
          employee_user_id: member.admin_user_id,
          employee_name: employee.name,
          kind: rule.kind,
          title: rule.title(rule.months / 12),
          summary: `Celebrating ${employee.name}'s dedication and teamwork.`,
          celebration_on: celebrationOn,
          visibility: "team",
          source: "system",
          status: "active",
          created_at: now,
          updated_at: now
        }
      });
    }
    if (member.show_birthday && member.birthday_month && member.birthday_day) {
      const year = Number(today.slice(0, 4));
      const celebrationOn = `${year}-${String(member.birthday_month).padStart(2, "0")}-${String(member.birthday_day).padStart(2, "0")}`;
      ops.push({
        op: "upsert",
        table: "team_engagement_milestones",
        conflict: ["employee_user_id", "kind", "celebration_on"],
        values: {
          id: randomUUID(),
          employee_user_id: member.admin_user_id,
          employee_name: employee.name,
          kind: "birthday",
          title: `Happy birthday, ${employee.name.split(" ")[0] ?? employee.name}!`,
          summary: "Celebrating a teammate's special day.",
          celebration_on: celebrationOn,
          visibility: "team",
          source: "system",
          status: "active",
          created_at: now,
          updated_at: now
        }
      });
    }
  }

  if (ops.length) await input.db.commit(ops);
  return { generated: ops.length };
}

export async function syncPackMilestones(ctx: ServiceContext, staff: StaffHrRow[]) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPackTable(ctx, "team_engagement_milestones");
  return syncPackMilestonesCore({
    db: ctx.db,
    staff,
    directory: await ctx.directory(),
    now: ctx.now
  });
}

export async function saveFunQuestion(
  ctx: ServiceContext,
  input: { id?: unknown; prompt?: unknown; cadence?: unknown; publishAt?: unknown; closeAt?: unknown }
) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPackTable(ctx, "team_engagement_fun_questions");
  const prompt = multilineText(input.prompt, 401);
  if (prompt.length < 5) throw validationError("Add a question prompt.");
  assertCommunityText(prompt, "fun");
  const cadence = input.cadence === "weekly" ? "weekly" : "daily";
  const now = nowIso(ctx);
  const id = typeof input.id === "string" ? input.id : randomUUID();
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_fun_questions",
      conflict: ["id"],
      values: {
        id,
        prompt: prompt.trim(),
        cadence,
        status: "draft",
        publish_at: typeof input.publishAt === "string" ? input.publishAt : null,
        close_at: typeof input.closeAt === "string" ? input.closeAt : null,
        allow_multiple_responses: false,
        created_by_user_id: ctx.actor.userId,
        created_by_name: ctx.actor.name,
        created_at: now,
        updated_at: now
      }
    }
  ]);
  return { id };
}

export async function publishFunQuestion(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_fun_questions",
      match: { id },
      set: { status: "active", publish_at: now, updated_at: now },
      expectRows: 1
    }
  ]);
  return { id };
}

export async function saveFunPoll(
  ctx: ServiceContext,
  input: { id?: unknown; prompt?: unknown; options?: unknown; allowMultiple?: unknown; allowVoteChange?: unknown }
) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertPackTable(ctx, "team_engagement_fun_polls");
  const prompt = multilineText(input.prompt, 301);
  if (prompt.length < 5) throw validationError("Add a poll question.");
  assertCommunityText(prompt, "fun");
  const labels = Array.isArray(input.options)
    ? input.options.map((value) => multilineText(value, 121).trim()).filter(Boolean)
    : [];
  if (labels.length < 2) throw validationError("Polls need at least two options.");
  for (const label of labels) assertCommunityText(label, "fun");
  const now = nowIso(ctx);
  const pollId = typeof input.id === "string" ? input.id : randomUUID();
  const ops: DbOp[] = [
    {
      op: "upsert",
      table: "team_engagement_fun_polls",
      conflict: ["id"],
      values: {
        id: pollId,
        prompt: prompt.trim(),
        status: "draft",
        allow_multiple: input.allowMultiple === true,
        allow_vote_change: input.allowVoteChange === true,
        hide_results_until_vote: false,
        publish_at: null,
        close_at: null,
        created_by_user_id: ctx.actor.userId,
        created_by_name: ctx.actor.name,
        created_at: now,
        updated_at: now
      }
    }
  ];
  if (typeof input.id === "string") {
    ops.push({
      op: "delete",
      table: "team_engagement_fun_poll_options",
      match: { poll_id: pollId }
    });
  }
  labels.forEach((label, index) => {
    ops.push({
      op: "insert",
      table: "team_engagement_fun_poll_options",
      values: { id: randomUUID(), poll_id: pollId, label, sort_order: index }
    });
  });
  await ctx.db.commit(ops);
  return { id: pollId };
}

export async function publishFunPoll(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_fun_polls",
      match: { id },
      set: { status: "active", publish_at: now, updated_at: now },
      expectRows: 1
    }
  ]);
  return { id };
}