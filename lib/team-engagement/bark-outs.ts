import { randomUUID } from "node:crypto";
import {
  BARK_OUT_CONTEXT_MAX,
  BARK_OUT_MESSAGE_MAX,
  BARK_OUT_REACTIONS,
  BARK_OUT_STATUS_LABELS,
  MODERATION_REASON_CODES,
  MODERATION_REASON_LABELS,
  type BarkOutReaction,
  type BarkOutStatus,
  type ModerationReasonCode
} from "@/lib/team-engagement/constants";
import {
  addDaysToDateKey,
  auditOp,
  daysAgoIso,
  departmentsLabel,
  inScope,
  multilineText,
  nowIso,
  oneOf,
  optionalText,
  pacificDayStartIso,
  requireFeature,
  requireStorage,
  requireUuid,
  scopeFilterDepartments,
  text,
  type ServiceContext
} from "@/lib/team-engagement/context";
import { EngagementError, conflictError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { PUBLISHED_NOTICE, REVIEW_NOTICE, authorNoticeFor, barkOutFingerprint, moderateBarkOut } from "@/lib/team-engagement/moderation";
import { tierRank } from "@/lib/team-engagement/permissions";
import type {
  BarkOutRow,
  ConcernReportRow,
  DbFilter,
  DbOp,
  DepartmentProfileRow,
  EngagementActor,
  ModerationEventRow,
  PreferenceRow,
  ReactionRow
} from "@/lib/team-engagement/types";

const PAGE_SIZE = 25;
const DUPLICATE_WINDOW_DAYS = 30;
const POLICY_COOLDOWN_REJECTIONS = 3;

export type BarkOutView = {
  id: string;
  author: { userId: string | null; name: string };
  recipient: { userId: string | null; name: string; departments: string[] };
  category: { key: string; label: string };
  message: string;
  context: string | null;
  status: BarkOutStatus;
  statusLabel: string;
  createdAt: string;
  publishedAt: string | null;
  reactions: Record<BarkOutReaction, number>;
  myReactions: BarkOutReaction[];
};

export type AuthoredBarkOutView = BarkOutView & {
  authorPrompt: string | null;
  authorNotice: string | null;
  canConfirm: boolean;
  canWithdraw: boolean;
};

export type ModerationItemView = BarkOutView & {
  authorDepartments: string[];
  outcome: string;
  reasons: { code: string; label: string }[];
  ai: { provider: string | null; model: string | null; confidence: number | null } | null;
  aiNote: string | null;
  escalated: { at: string; note: string | null } | null;
  openReportCount: number;
  reports: { id: string; reporterName: string; reason: string; status: string; createdAt: string; resolutionNote: string | null }[];
  history: { type: string; outcome: string | null; actorName: string | null; note: string | null; at: string }[];
  decidedBy: string | null;
  decidedAt: string | null;
  canDecide: boolean;
  decideBlockedReason: string | null;
};

function emptyReactions(): Record<BarkOutReaction, number> {
  return { kudos: 0, thanks: 0, celebrate: 0 };
}

async function categoryLabel(ctx: ServiceContext) {
  const settings = await ctx.settings();
  const labels = new Map(settings.categories.map((category) => [category.key, category.label]));
  return (key: string) => labels.get(key) ?? key.replace(/_/g, " ");
}

async function loadReactions(ctx: ServiceContext, ids: string[]) {
  const counts = new Map<string, Record<BarkOutReaction, number>>();
  const mine = new Map<string, BarkOutReaction[]>();
  if (!ids.length) return { counts, mine };
  const { rows } = await ctx.db.select<ReactionRow>("team_engagement_reactions", {
    filters: [{ column: "bark_out_id", op: "in", value: ids }],
    limit: 1000
  });
  for (const row of rows) {
    const entry = counts.get(row.bark_out_id) ?? emptyReactions();
    entry[row.reaction] += 1;
    counts.set(row.bark_out_id, entry);
    if (row.user_id === ctx.actor.userId) mine.set(row.bark_out_id, [...(mine.get(row.bark_out_id) ?? []), row.reaction]);
  }
  return { counts, mine };
}

export async function barkOutViews(ctx: ServiceContext, rows: BarkOutRow[]): Promise<BarkOutView[]> {
  const label = await categoryLabel(ctx);
  const { counts, mine } = await loadReactions(
    ctx,
    rows.filter((row) => row.status === "published").map((row) => row.id)
  );
  return rows.map((row) => ({
    id: row.id,
    author: { userId: row.author_user_id, name: row.author_name },
    recipient: { userId: row.recipient_user_id, name: row.recipient_name, departments: row.recipient_departments },
    category: { key: row.category, label: label(row.category) },
    message: row.message,
    context: row.context,
    status: row.status,
    statusLabel: BARK_OUT_STATUS_LABELS[row.status],
    createdAt: row.created_at,
    publishedAt: row.published_at,
    reactions: counts.get(row.id) ?? emptyReactions(),
    myReactions: mine.get(row.id) ?? []
  }));
}

function authoredView(view: BarkOutView, row: BarkOutRow): AuthoredBarkOutView {
  return {
    ...view,
    authorPrompt: row.status === "awaiting_confirmation" ? row.author_prompt : null,
    authorNotice: row.author_notice,
    canConfirm: row.status === "awaiting_confirmation" && row.author_confirmations === 0,
    canWithdraw: row.status === "awaiting_confirmation" || row.status === "pending_review" || row.status === "published"
  };
}

async function getBarkOut(ctx: ServiceContext, id: string): Promise<BarkOutRow> {
  const { rows } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1
  });
  const row = rows[0];
  if (!row) throw notFoundError("That Bark Out");
  return row;
}

async function countBarkOuts(ctx: ServiceContext, filters: DbFilter[]) {
  const { total } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", { filters, limit: 1, count: true });
  return total ?? 0;
}

function moderationEvent(
  ctx: ServiceContext,
  barkOutId: string,
  input: {
    type: ModerationEventRow["event_type"];
    outcome?: string | null;
    reasons?: readonly string[];
    note?: string | null;
    ai?: { provider: string; model: string; confidence: number } | null;
    actor?: boolean;
  }
): DbOp {
  return {
    op: "insert",
    table: "team_engagement_moderation_events",
    values: {
      id: randomUUID(),
      bark_out_id: barkOutId,
      event_type: input.type,
      outcome: input.outcome ?? null,
      reason_codes: [...(input.reasons ?? [])],
      moderator_note: input.note ?? null,
      ai_provider: input.ai?.provider ?? null,
      ai_model: input.ai?.model ?? null,
      ai_confidence: input.ai ? Math.round(input.ai.confidence * 1000) / 1000 : null,
      actor_user_id: input.actor === false ? null : ctx.actor.userId,
      actor_name: input.actor === false ? null : ctx.actor.name,
      created_at: nowIso(ctx)
    }
  };
}

async function notifySafely(ctx: ServiceContext, notification: Parameters<ServiceContext["notify"]>[0]) {
  try {
    await ctx.notify(notification);
  } catch {
    // Notifications never block the recognition itself.
  }
}

async function recipientWantsNotifications(ctx: ServiceContext, userId: string | null) {
  if (!userId) return false;
  const { rows } = await ctx.db.select<PreferenceRow>("team_engagement_preferences", {
    filters: [{ column: "user_id", op: "eq", value: userId }],
    limit: 1
  });
  return rows[0]?.notify_on_bark_out !== false;
}

async function announcePublished(ctx: ServiceContext, row: BarkOutRow) {
  if (row.recipient_user_id && (await recipientWantsNotifications(ctx, row.recipient_user_id))) {
    await notifySafely(ctx, {
      recipientUserId: row.recipient_user_id,
      title: `${row.author_name} sent you a Bark Out`,
      body: row.message.slice(0, 180),
      dedupeKey: `bark_out:${row.id}:published:recipient`
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Employee actions
// ---------------------------------------------------------------------------------------------

export async function createBarkOut(
  ctx: ServiceContext,
  input: { recipientUserId?: unknown; category?: unknown; message?: unknown; context?: unknown }
): Promise<{ barkOut: AuthoredBarkOutView; notice: string; prompt: string | null }> {
  requireStorage(ctx);
  await requireFeature(ctx, "bark_outs");
  const actor = ctx.actor;
  const recipientId = requireUuid(input.recipientUserId, "recipient");
  if (recipientId === actor.userId) {
    throw new EngagementError(400, "self_recognition", "Bark Outs recognize someone else. Pick a teammate to recognize.");
  }

  const [settings, directory] = await Promise.all([ctx.settings(), ctx.directory()]);
  const recipient = directory.byId.get(recipientId);
  if (!recipient || !recipient.active) throw validationError("Choose an active teammate to recognize.");

  const category = settings.categories.find((entry) => entry.key === input.category && entry.active);
  if (!category) throw validationError("Choose a Bark Out category.");

  const message = multilineText(input.message, BARK_OUT_MESSAGE_MAX + 1);
  if (message.length < settings.participation.minMessageLength) {
    throw validationError(`Say a little more — Bark Outs need at least ${settings.participation.minMessageLength} characters.`);
  }
  if (message.length > BARK_OUT_MESSAGE_MAX) throw validationError(`Keep Bark Outs under ${BARK_OUT_MESSAGE_MAX} characters.`);
  const context = optionalText(input.context, BARK_OUT_CONTEXT_MAX + 1);
  if (context && context.length > BARK_OUT_CONTEXT_MAX) throw validationError(`Keep the context under ${BARK_OUT_CONTEXT_MAX} characters.`);

  if (!settings.participation.allowCrossDepartment) {
    const shared = recipient.departments.some((department) => actor.departments.includes(department));
    if (!shared) throw validationError("Bark Outs are limited to your own department right now.");
  }

  if (recipient.departments.length) {
    const { rows: profiles } = await ctx.db.select<DepartmentProfileRow>("team_engagement_department_profiles", {
      filters: [{ column: "department_key", op: "in", value: recipient.departments }]
    });
    const paused = recipient.departments.every(
      (department) => profiles.find((profile) => profile.department_key === department)?.recognition_enabled === false
    );
    if (paused) throw validationError("Bark Outs for that department are paused right now.");
  }

  const fingerprint = barkOutFingerprint(message);
  const [recentPolicyRejections, sentToday, sentToRecipient, duplicates] = await Promise.all([
    countBarkOuts(ctx, [
      { column: "author_user_id", op: "eq", value: actor.userId },
      { column: "moderation_outcome", op: "eq", value: "policy_rejected" },
      { column: "created_at", op: "gte", value: daysAgoIso(ctx, 1) }
    ]),
    countBarkOuts(ctx, [
      { column: "author_user_id", op: "eq", value: actor.userId },
      { column: "created_at", op: "gte", value: daysAgoIso(ctx, 1) }
    ]),
    countBarkOuts(ctx, [
      { column: "author_user_id", op: "eq", value: actor.userId },
      { column: "recipient_user_id", op: "eq", value: recipientId },
      { column: "status", op: "not_in", value: ["withdrawn", "rejected"] },
      { column: "created_at", op: "gte", value: daysAgoIso(ctx, 7) }
    ]),
    countBarkOuts(ctx, [
      { column: "author_user_id", op: "eq", value: actor.userId },
      { column: "recipient_user_id", op: "eq", value: recipientId },
      { column: "content_fingerprint", op: "eq", value: fingerprint },
      { column: "status", op: "neq", value: "withdrawn" },
      { column: "created_at", op: "gte", value: daysAgoIso(ctx, DUPLICATE_WINDOW_DAYS) }
    ])
  ]);

  if (recentPolicyRejections >= POLICY_COOLDOWN_REJECTIONS) {
    throw new EngagementError(
      429,
      "cooldown",
      "Bark Outs are paused for you for the next 24 hours after several messages that couldn't be posted."
    );
  }
  if (sentToday >= settings.participation.dailyLimit) {
    throw new EngagementError(429, "daily_limit", `You can send ${settings.participation.dailyLimit} Bark Outs a day. Try again tomorrow.`);
  }
  if (sentToRecipient >= settings.participation.perRecipientWeeklyLimit) {
    throw new EngagementError(
      429,
      "recipient_limit",
      `You've recognized ${recipient.name} ${settings.participation.perRecipientWeeklyLimit} times this week. Spread the love to someone else too!`
    );
  }
  if (duplicates > 0) throw new EngagementError(409, "duplicate", "You already sent this Bark Out.");

  const decision = await moderateBarkOut({
    message,
    context,
    category: category.key,
    policy: settings.aiPolicy,
    ai: ctx.moderationAi([actor.name, recipient.name])
  });

  const at = nowIso(ctx);
  const id = randomUUID();
  const row: BarkOutRow = {
    id,
    author_user_id: actor.userId,
    author_name: actor.name,
    author_departments: actor.departments,
    recipient_user_id: recipient.userId,
    recipient_name: recipient.name,
    recipient_departments: recipient.departments,
    category: category.key,
    message,
    context,
    status: decision.status,
    moderation_outcome: decision.outcome,
    author_confirmations: 0,
    author_prompt: decision.authorPrompt,
    author_notice: decision.authorNotice,
    content_fingerprint: fingerprint,
    escalated_at: null,
    escalation_note: null,
    open_report_count: 0,
    published_at: decision.status === "published" ? at : null,
    decided_at: null,
    decided_by_user_id: null,
    decided_by_name: null,
    created_at: at,
    updated_at: at
  };
  const aiNote =
    decision.aiSkipped === "not_configured"
      ? "AI moderation is not connected; sent to human review."
      : decision.aiSkipped === "disabled"
        ? "AI moderation is turned off; sent to human review."
        : decision.aiSkipped === "failed"
          ? "AI moderation did not respond; sent to human review."
          : null;
  await ctx.db.commit([
    { op: "insert", table: "team_engagement_bark_outs", values: row },
    moderationEvent(ctx, id, {
      type: decision.ai ? "ai_review" : "screened",
      outcome: decision.outcome,
      reasons: decision.reasons,
      note: aiNote,
      ai: decision.ai,
      actor: false
    })
  ]);

  if (row.status === "published") await announcePublished(ctx, row);
  const [view] = await barkOutViews(ctx, [row]);
  return { barkOut: authoredView(view!, row), notice: decision.authorNotice, prompt: decision.authorPrompt };
}

function requireAuthor(actor: EngagementActor, row: BarkOutRow) {
  if (row.author_user_id !== actor.userId) throw notFoundError("That Bark Out");
}

export async function confirmBarkOut(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "bark_outs");
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  requireAuthor(ctx.actor, row);
  if (row.status !== "awaiting_confirmation" || row.author_confirmations > 0) {
    throw new EngagementError(409, "not_confirmable", "This Bark Out doesn't need a confirmation.");
  }
  const at = nowIso(ctx);
  const [updated] = await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_bark_outs",
      match: { id: row.id, status: "awaiting_confirmation", author_confirmations: 0 },
      set: {
        status: "pending_review",
        moderation_outcome: "human_review",
        author_confirmations: 1,
        author_prompt: null,
        author_notice: REVIEW_NOTICE,
        updated_at: at
      },
      expectRows: 1
    },
    moderationEvent(ctx, row.id, { type: "author_confirmed", outcome: "human_review" })
  ]);
  const next = updated![0] as unknown as BarkOutRow;
  const [view] = await barkOutViews(ctx, [next]);
  return { barkOut: authoredView(view!, next), notice: REVIEW_NOTICE };
}

export async function withdrawBarkOut(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  requireAuthor(ctx.actor, row);
  if (!["awaiting_confirmation", "pending_review", "published"].includes(row.status)) {
    throw new EngagementError(409, "not_withdrawable", "This Bark Out can't be withdrawn.");
  }
  const at = nowIso(ctx);
  const [updated] = await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_bark_outs",
      match: { id: row.id, status: row.status },
      set: { status: "withdrawn", moderation_outcome: "author_withdrawn", author_prompt: null, author_notice: "You withdrew this Bark Out.", updated_at: at },
      expectRows: 1
    },
    moderationEvent(ctx, row.id, { type: "withdrawn", outcome: "author_withdrawn" })
  ]);
  const next = updated![0] as unknown as BarkOutRow;
  const [view] = await barkOutViews(ctx, [next]);
  return { barkOut: authoredView(view!, next) };
}

export async function reactToBarkOut(ctx: ServiceContext, input: { id?: unknown; reaction?: unknown }, add: boolean) {
  requireStorage(ctx);
  await requireFeature(ctx, "reactions");
  const reaction = oneOf(input.reaction, BARK_OUT_REACTIONS, "reaction");
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  if (row.status !== "published") throw notFoundError("That Bark Out");
  if (row.author_user_id === ctx.actor.userId) throw validationError("You can't react to a Bark Out you wrote.");
  if (add) {
    try {
      await ctx.db.commit([
        {
          op: "insert",
          table: "team_engagement_reactions",
          values: { id: randomUUID(), bark_out_id: row.id, user_id: ctx.actor.userId, reaction, created_at: nowIso(ctx) }
        }
      ]);
    } catch (error) {
      if (!(error instanceof EngagementError && error.code === "duplicate")) throw error;
    }
  } else {
    await ctx.db.commit([
      { op: "delete", table: "team_engagement_reactions", match: { bark_out_id: row.id, user_id: ctx.actor.userId, reaction } }
    ]);
  }
  const [view] = await barkOutViews(ctx, [row]);
  return { barkOut: view! };
}

export async function reportBarkOut(ctx: ServiceContext, input: { id?: unknown; reason?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "concern_reports");
  const reason = multilineText(input.reason, 600);
  if (reason.length < 3) throw validationError("Tell the moderators briefly what concerns you.");
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  if (row.status !== "published") throw notFoundError("That Bark Out");
  if (row.author_user_id === ctx.actor.userId) throw validationError("You can withdraw your own Bark Out instead of reporting it.");

  const settings = await ctx.settings();
  const at = nowIso(ctx);
  const nextCount = row.open_report_count + 1;
  const hide = nextCount >= settings.participation.hideAfterReports;
  const ops: DbOp[] = [
    {
      op: "insert",
      table: "team_engagement_reports",
      values: {
        id: randomUUID(),
        bark_out_id: row.id,
        reporter_user_id: ctx.actor.userId,
        reporter_name: ctx.actor.name,
        reason,
        status: "open",
        created_at: at,
        updated_at: at
      }
    },
    {
      op: "update",
      table: "team_engagement_bark_outs",
      match: { id: row.id, open_report_count: row.open_report_count, status: "published" },
      set: hide
        ? { open_report_count: nextCount, status: "pending_review", moderation_outcome: "hidden_after_reports", updated_at: at }
        : { open_report_count: nextCount, updated_at: at },
      expectRows: 1
    },
    moderationEvent(ctx, row.id, { type: "report_filed", outcome: null })
  ];
  if (hide) ops.push(moderationEvent(ctx, row.id, { type: "auto_hidden", outcome: "hidden_after_reports", actor: false }));
  try {
    await ctx.db.commit(ops);
  } catch (error) {
    if (error instanceof EngagementError && error.code === "duplicate") {
      throw new EngagementError(409, "duplicate", "You already reported this Bark Out. A moderator will review it.");
    }
    throw error;
  }
  return { reported: true, hidden: hide };
}

// ---------------------------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------------------------

async function hiddenRecipients(ctx: ServiceContext) {
  const { rows } = await ctx.db.select<PreferenceRow>("team_engagement_preferences", {
    filters: [{ column: "show_on_team_feed", op: "eq", value: false }],
    limit: 1000
  });
  return rows.map((row) => row.user_id);
}

function pageOffset(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/** Published Bark Outs everyone can see, minus people who asked to stay off the shared feed. */
export async function employeeFeed(ctx: ServiceContext, input: { offset?: unknown; category?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "bark_outs");
  const offset = pageOffset(input.offset);
  const hidden = (await hiddenRecipients(ctx)).filter((userId) => userId !== ctx.actor.userId);
  const filters: DbFilter[] = [{ column: "status", op: "eq", value: "published" }];
  if (hidden.length) filters.push({ column: "recipient_user_id", op: "not_in", value: hidden });
  if (typeof input.category === "string" && input.category) filters.push({ column: "category", op: "eq", value: input.category });
  const { rows, total } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters,
    order: [
      { column: "published_at", ascending: false },
      { column: "id", ascending: false }
    ],
    limit: PAGE_SIZE,
    offset,
    count: true
  });
  return { items: await barkOutViews(ctx, rows), total: total ?? rows.length, offset, pageSize: PAGE_SIZE };
}

export async function myBarkOuts(ctx: ServiceContext) {
  requireStorage(ctx);
  const [authored, received] = await Promise.all([
    ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
      filters: [{ column: "author_user_id", op: "eq", value: ctx.actor.userId }],
      order: [{ column: "created_at", ascending: false }],
      limit: 50
    }),
    ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
      filters: [
        { column: "recipient_user_id", op: "eq", value: ctx.actor.userId },
        { column: "status", op: "eq", value: "published" }
      ],
      order: [{ column: "published_at", ascending: false }],
      limit: 50
    })
  ]);
  const authoredViews = await barkOutViews(ctx, authored.rows);
  return {
    sent: authoredViews.map((view, index) => authoredView(view, authored.rows[index]!)),
    received: await barkOutViews(ctx, received.rows)
  };
}

function dateBound(value: unknown, endOfDay = false) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return null;
  return pacificDayStartIso(endOfDay ? addDaysToDateKey(value, 1) : value);
}

function scopeFilters(actor: EngagementActor, department: unknown): DbFilter[] {
  const scoped = scopeFilterDepartments(actor);
  if (typeof department === "string" && department) {
    if (scoped && !scoped.includes(department)) throw forbiddenError();
    return [
      {
        op: "or",
        filters: [
          { column: "recipient_departments", op: "ov", value: [department] },
          { column: "author_departments", op: "ov", value: [department] }
        ]
      }
    ];
  }
  if (!scoped) return [];
  if (!scoped.length) return [{ column: "id", op: "is_null" }];
  return [
    {
      op: "or",
      filters: [
        { column: "recipient_departments", op: "ov", value: scoped },
        { column: "author_departments", op: "ov", value: scoped }
      ]
    }
  ];
}

/** Leadership feed of posted Bark Outs, limited to the departments this person leads. */
export async function leadershipBarkOuts(
  ctx: ServiceContext,
  input: { offset?: unknown; category?: unknown; department?: unknown; from?: unknown; to?: unknown }
) {
  requireStorage(ctx);
  const offset = pageOffset(input.offset);
  const filters: DbFilter[] = [{ column: "status", op: "eq", value: "published" }, ...scopeFilters(ctx.actor, input.department)];
  if (typeof input.category === "string" && input.category) filters.push({ column: "category", op: "eq", value: input.category });
  const from = dateBound(input.from);
  const to = dateBound(input.to, true);
  if (from) filters.push({ column: "published_at", op: "gte", value: from });
  if (to) filters.push({ column: "published_at", op: "lt", value: to });
  const { rows, total } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters,
    order: [
      { column: "published_at", ascending: false },
      { column: "id", ascending: false }
    ],
    limit: PAGE_SIZE,
    offset,
    count: true
  });
  return { items: await barkOutViews(ctx, rows), total: total ?? rows.length, offset, pageSize: PAGE_SIZE };
}

// ---------------------------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------------------------

const QUEUE_STATUSES: Record<string, BarkOutStatus[]> = {
  queue: ["pending_review"],
  awaiting_author: ["awaiting_confirmation"],
  reported: ["published", "pending_review"],
  rejected: ["rejected"],
  removed: ["removed"],
  published: ["published"]
};

function decisionBlock(actor: EngagementActor, row: BarkOutRow): string | null {
  if (row.author_user_id === actor.userId || row.recipient_user_id === actor.userId) {
    return "You can't moderate a Bark Out you wrote or received.";
  }
  if (row.escalated_at && tierRank(actor.tier) < tierRank("admin")) return "Escalated to Admin for a decision.";
  return null;
}

function assertModeratable(actor: EngagementActor, row: BarkOutRow) {
  if (!inScope(actor, [...row.recipient_departments, ...row.author_departments])) throw notFoundError("That Bark Out");
  const blocked = decisionBlock(actor, row);
  if (blocked) throw new EngagementError(403, "forbidden", blocked);
}

export async function moderationQueue(
  ctx: ServiceContext,
  input: { status?: unknown; department?: unknown; offset?: unknown; from?: unknown; to?: unknown }
) {
  requireStorage(ctx);
  const statusKey = typeof input.status === "string" && QUEUE_STATUSES[input.status] ? input.status : "queue";
  const offset = pageOffset(input.offset);
  const filters: DbFilter[] = [
    { column: "status", op: "in", value: QUEUE_STATUSES[statusKey]! },
    ...scopeFilters(ctx.actor, input.department)
  ];
  if (statusKey === "reported") filters.push({ column: "open_report_count", op: "gt", value: 0 });
  const from = dateBound(input.from);
  const to = dateBound(input.to, true);
  if (from) filters.push({ column: "created_at", op: "gte", value: from });
  if (to) filters.push({ column: "created_at", op: "lt", value: to });

  const { rows, total } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
    filters,
    order: [
      { column: statusKey === "queue" || statusKey === "awaiting_author" ? "created_at" : "updated_at", ascending: statusKey === "queue" },
      { column: "id", ascending: true }
    ],
    limit: PAGE_SIZE,
    offset,
    count: true
  });
  const ids = rows.map((row) => row.id);
  const [views, events, reports] = await Promise.all([
    barkOutViews(ctx, rows),
    ids.length
      ? ctx.db.select<ModerationEventRow>("team_engagement_moderation_events", {
          filters: [{ column: "bark_out_id", op: "in", value: ids }],
          order: [{ column: "created_at", ascending: true }],
          limit: 1000
        })
      : Promise.resolve({ rows: [] as ModerationEventRow[], total: null }),
    ids.length
      ? ctx.db.select<ConcernReportRow>("team_engagement_reports", {
          filters: [{ column: "bark_out_id", op: "in", value: ids }],
          order: [{ column: "created_at", ascending: true }],
          limit: 1000
        })
      : Promise.resolve({ rows: [] as ConcernReportRow[], total: null })
  ]);

  const seesReporters = tierRank(ctx.actor.tier) >= tierRank("admin");
  const items: ModerationItemView[] = rows.map((row, index) => {
    const rowEvents = events.rows.filter((event) => event.bark_out_id === row.id);
    const aiEvent = [...rowEvents].reverse().find((event) => event.event_type === "ai_review" || event.event_type === "screened");
    const reasonCodes = [...new Set(rowEvents.flatMap((event) => event.reason_codes))];
    const blocked = decisionBlock(ctx.actor, row);
    return {
      ...views[index]!,
      authorDepartments: row.author_departments,
      outcome: row.moderation_outcome,
      reasons: reasonCodes.map((code) => ({ code, label: MODERATION_REASON_LABELS[code as ModerationReasonCode] ?? code })),
      ai: aiEvent?.ai_provider ? { provider: aiEvent.ai_provider, model: aiEvent.ai_model, confidence: aiEvent.ai_confidence } : null,
      aiNote: aiEvent?.ai_provider ? null : aiEvent?.moderator_note ?? null,
      escalated: row.escalated_at ? { at: row.escalated_at, note: row.escalation_note } : null,
      openReportCount: row.open_report_count,
      reports: reports.rows
        .filter((report) => report.bark_out_id === row.id)
        .map((report) => ({
          id: report.id,
          reporterName: seesReporters ? report.reporter_name : "A team member",
          reason: report.reason,
          status: report.status,
          createdAt: report.created_at,
          resolutionNote: report.resolution_note
        })),
      history: rowEvents.map((event) => ({
        type: event.event_type,
        outcome: event.outcome,
        actorName: event.actor_name,
        note: event.event_type === "moderator_decision" || event.event_type === "escalated" || event.event_type === "report_resolved" ? event.moderator_note : null,
        at: event.created_at
      })),
      decidedBy: row.decided_by_name,
      decidedAt: row.decided_at,
      canDecide: !blocked,
      decideBlockedReason: blocked
    };
  });
  return { items, total: total ?? items.length, offset, pageSize: PAGE_SIZE, status: statusKey };
}

/** People with repeated policy rejections in the last 90 days, for Admin and Super Admin moderators. */
export async function repeatViolations(ctx: ServiceContext) {
  requireStorage(ctx);
  if (tierRank(ctx.actor.tier) < tierRank("admin")) return [];
  const filters: DbFilter[] = [
    { column: "moderation_outcome", op: "in", value: ["policy_rejected", "moderator_rejected", "moderator_removed"] },
    { column: "created_at", op: "gte", value: daysAgoIso(ctx, 90) },
    ...scopeFilters(ctx.actor, null)
  ];
  const { rows } = await ctx.db.select<BarkOutRow>("team_engagement_bark_outs", { filters, limit: 1000 });
  const byAuthor = new Map<string, { userId: string | null; name: string; count: number; lastAt: string }>();
  for (const row of rows) {
    const key = row.author_user_id ?? row.author_name;
    const entry = byAuthor.get(key) ?? { userId: row.author_user_id, name: row.author_name, count: 0, lastAt: row.created_at };
    entry.count += 1;
    if (row.created_at > entry.lastAt) entry.lastAt = row.created_at;
    byAuthor.set(key, entry);
  }
  return [...byAuthor.values()].filter((entry) => entry.count >= 2).sort((a, b) => a.name.localeCompare(b.name));
}

function reasonCode(value: unknown): ModerationReasonCode {
  return oneOf(value, MODERATION_REASON_CODES, "reason");
}

async function decide(
  ctx: ServiceContext,
  row: BarkOutRow,
  input: {
    fromStatuses: BarkOutStatus[];
    status: BarkOutStatus;
    outcome: BarkOutRow["moderation_outcome"];
    action: string;
    reason: ModerationReasonCode | null;
    note: string | null;
    authorNotice: string | null;
    extra?: DbOp[];
    reportStatus?: "kept" | "removed";
  }
) {
  if (!input.fromStatuses.includes(row.status)) throw conflictError("This Bark Out was already handled. Refresh the queue.");
  const at = nowIso(ctx);
  const set: Record<string, unknown> = {
    status: input.status,
    moderation_outcome: input.outcome,
    decided_at: at,
    decided_by_user_id: ctx.actor.userId,
    decided_by_name: ctx.actor.name,
    author_prompt: null,
    author_notice: input.authorNotice,
    updated_at: at
  };
  if (input.status === "published" && !row.published_at) set.published_at = at;
  const ops: DbOp[] = [
    { op: "update", table: "team_engagement_bark_outs", match: { id: row.id, status: row.status }, set, expectRows: 1 },
    moderationEvent(ctx, row.id, {
      type: "moderator_decision",
      outcome: input.outcome,
      reasons: input.reason ? [input.reason] : [],
      note: input.note
    }),
    ...(input.extra ?? []),
    auditOp(ctx, {
      category: "moderation",
      action: input.action,
      targetType: "bark_out",
      targetId: row.id,
      targetLabel: `Bark Out from ${row.author_name} to ${row.recipient_name}`,
      scope: departmentsLabel(row.recipient_departments),
      previous: { status: row.status },
      next: { status: input.status, reason: input.reason },
      reason: input.note
    })
  ];
  if (input.reportStatus && row.open_report_count > 0) {
    ops.push({
      op: "update",
      table: "team_engagement_reports",
      match: { bark_out_id: row.id, status: "open" },
      set: {
        status: input.reportStatus,
        resolution_note: input.note,
        resolved_by_user_id: ctx.actor.userId,
        resolved_by_name: ctx.actor.name,
        resolved_at: at,
        updated_at: at
      }
    });
    (ops[0] as Extract<DbOp, { op: "update" }>).set.open_report_count = 0;
  }
  const [updated] = await ctx.db.commit(ops);
  return updated![0] as unknown as BarkOutRow;
}

export async function approveBarkOut(ctx: ServiceContext, input: { id?: unknown; note?: unknown }) {
  requireStorage(ctx);
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  assertModeratable(ctx.actor, row);
  const note = optionalText(input.note, 1000);
  const next = await decide(ctx, row, {
    fromStatuses: ["pending_review"],
    status: "published",
    outcome: "moderator_approved",
    action: "bark_out.approve",
    reason: null,
    note,
    authorNotice: PUBLISHED_NOTICE,
    reportStatus: "kept"
  });
  await announcePublished(ctx, next);
  if (next.author_user_id) {
    await notifySafely(ctx, {
      recipientUserId: next.author_user_id,
      title: "Your Bark Out is posted",
      body: `Your Bark Out for ${next.recipient_name} is now on the team feed.`,
      dedupeKey: `bark_out:${next.id}:approved:author`
    });
  }
  return { id: next.id, status: next.status };
}

export async function rejectBarkOut(ctx: ServiceContext, input: { id?: unknown; reason?: unknown; note?: unknown; authorMessage?: unknown }) {
  requireStorage(ctx);
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  assertModeratable(ctx.actor, row);
  const reason = reasonCode(input.reason);
  const authorMessage = optionalText(input.authorMessage, 400);
  const next = await decide(ctx, row, {
    fromStatuses: ["pending_review", "awaiting_confirmation"],
    status: "rejected",
    outcome: "moderator_rejected",
    action: "bark_out.reject",
    reason,
    note: optionalText(input.note, 1000),
    authorNotice: authorMessage ?? authorNoticeFor([reason])
  });
  if (next.author_user_id) {
    await notifySafely(ctx, {
      recipientUserId: next.author_user_id,
      title: "Your Bark Out wasn't posted",
      body: next.author_notice ?? "A moderator reviewed your Bark Out and didn't post it.",
      dedupeKey: `bark_out:${next.id}:rejected:author`
    });
  }
  return { id: next.id, status: next.status };
}

export async function removeBarkOut(ctx: ServiceContext, input: { id?: unknown; reason?: unknown; note?: unknown }) {
  requireStorage(ctx);
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  assertModeratable(ctx.actor, row);
  const reason = reasonCode(input.reason);
  const note = optionalText(input.note, 1000);
  if (!note || note.length < 5) throw validationError("Add a short note explaining the removal.");
  const next = await decide(ctx, row, {
    fromStatuses: ["published", "pending_review"],
    status: "removed",
    outcome: "moderator_removed",
    action: "bark_out.remove",
    reason,
    note,
    authorNotice: "A moderator removed this Bark Out from the team feed.",
    reportStatus: "removed"
  });
  if (next.author_user_id) {
    await notifySafely(ctx, {
      recipientUserId: next.author_user_id,
      title: "A Bark Out you wrote was removed",
      body: "A moderator removed one of your Bark Outs from the team feed.",
      dedupeKey: `bark_out:${next.id}:removed:author`
    });
  }
  return { id: next.id, status: next.status };
}

export async function escalateBarkOut(ctx: ServiceContext, input: { id?: unknown; note?: unknown }) {
  requireStorage(ctx);
  const row = await getBarkOut(ctx, requireUuid(input.id, "Bark Out"));
  assertModeratable(ctx.actor, row);
  if (row.status !== "pending_review") throw conflictError("Only Bark Outs waiting for review can be escalated.");
  const note = text(input.note, 600);
  if (note.length < 5) throw validationError("Add a short note for the Admin team.");
  const at = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_bark_outs",
      match: { id: row.id, status: "pending_review", escalated_at: null },
      set: { escalated_at: at, escalation_note: note, updated_at: at },
      expectRows: 1
    },
    moderationEvent(ctx, row.id, { type: "escalated", outcome: null, note }),
    auditOp(ctx, {
      category: "moderation",
      action: "bark_out.escalate",
      targetType: "bark_out",
      targetId: row.id,
      targetLabel: `Bark Out from ${row.author_name} to ${row.recipient_name}`,
      scope: departmentsLabel(row.recipient_departments),
      reason: note
    })
  ]);
  return { id: row.id, escalated: true };
}

export async function resolveReport(ctx: ServiceContext, input: { reportId?: unknown; resolution?: unknown; note?: unknown; reason?: unknown }) {
  requireStorage(ctx);
  const reportId = requireUuid(input.reportId, "report");
  const { rows } = await ctx.db.select<ConcernReportRow>("team_engagement_reports", {
    filters: [{ column: "id", op: "eq", value: reportId }],
    limit: 1
  });
  const report = rows[0];
  if (!report) throw notFoundError("That report");
  const row = await getBarkOut(ctx, report.bark_out_id);
  assertModeratable(ctx.actor, row);
  if (report.status !== "open") throw conflictError("This report was already resolved.");
  const resolution = oneOf(input.resolution, ["keep", "remove"] as const, "resolution");
  const note = optionalText(input.note, 1000);
  if (resolution === "remove") {
    await removeBarkOut(ctx, { id: row.id, reason: input.reason ?? "other", note });
    return { reportId, resolution };
  }
  const at = nowIso(ctx);
  const remaining = Math.max(row.open_report_count - 1, 0);
  const republish = remaining === 0 && row.status === "pending_review" && row.moderation_outcome === "hidden_after_reports";
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_reports",
      match: { id: report.id, status: "open" },
      set: {
        status: "kept",
        resolution_note: note,
        resolved_by_user_id: ctx.actor.userId,
        resolved_by_name: ctx.actor.name,
        resolved_at: at,
        updated_at: at
      },
      expectRows: 1
    },
    {
      op: "update",
      table: "team_engagement_bark_outs",
      match: { id: row.id, open_report_count: row.open_report_count, status: row.status },
      set: republish
        ? { open_report_count: remaining, status: "published", moderation_outcome: "moderator_approved", updated_at: at }
        : { open_report_count: remaining, updated_at: at },
      expectRows: 1
    },
    moderationEvent(ctx, row.id, { type: "report_resolved", outcome: republish ? "moderator_approved" : "kept", note }),
    auditOp(ctx, {
      category: "moderation",
      action: "bark_out.report_resolved",
      targetType: "bark_out_report",
      targetId: report.id,
      targetLabel: `Report on Bark Out from ${row.author_name} to ${row.recipient_name}`,
      scope: departmentsLabel(row.recipient_departments),
      previous: { status: "open" },
      next: { status: "kept", barkOutStatus: republish ? "published" : row.status },
      reason: note
    })
  ]);
  return { reportId, resolution };
}
