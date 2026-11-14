import { randomUUID } from "node:crypto";
import type { DepartmentKey } from "@/lib/admin/permissions";
import {
  DEVELOPMENT_RECORD_TYPES,
  DEVELOPMENT_STATUSES,
  DEVELOPMENT_VISIBILITIES,
  ENGAGEMENT_DEPARTMENTS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  OPERATIONAL_DEPARTMENTS,
  PROGRAM_CADENCES,
  PROGRAM_STATUSES,
  PROGRAM_TYPES,
  PROGRAM_TYPE_LABELS,
  departmentLabel,
  isEngagementDepartment,
  type ProgramCadence
} from "@/lib/team-engagement/constants";
import {
  auditOp,
  canViewEmployee,
  departmentsLabel,
  inScope,
  isoDate,
  multilineText,
  nowIso,
  oneOf,
  optionalText,
  requireEmployeeInScope,
  requireFeature,
  requireStorage,
  requireUuid,
  scopeFilterDepartments,
  text,
  type ServiceContext
} from "@/lib/team-engagement/context";
import { EngagementError, conflictError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { tierRank } from "@/lib/team-engagement/permissions";
import type {
  AnnouncementRow,
  DbFilter,
  DbOp,
  DepartmentManagerRow,
  DepartmentProfileRow,
  DevelopmentRecordRow,
  EngagementEmployee,
  FeedbackEventRow,
  FeedbackRow,
  NominationRow,
  PreferenceRow,
  ProgramRow
} from "@/lib/team-engagement/types";

const LIST_CAP = 500;

function departmentOverlapFilter(column: string, departments: string[] | null): DbFilter[] {
  if (!departments) return [];
  if (!departments.length) return [{ column: "id", op: "is_null" }];
  return [{ column, op: "ov", value: departments }];
}

async function employeeOrNull(ctx: ServiceContext, userId: string | null) {
  if (!userId) return null;
  return (await ctx.directory()).byId.get(userId) ?? null;
}

async function visibleToLeader(ctx: ServiceContext, userId: string | null) {
  const employee = await employeeOrNull(ctx, userId);
  if (!employee) return ctx.actor.scope.all && tierRank(ctx.actor.tier) >= tierRank("admin");
  return canViewEmployee(ctx.actor, employee);
}

// ---------------------------------------------------------------------------------------------
// Employee development
// ---------------------------------------------------------------------------------------------

export type DevelopmentView = Omit<DevelopmentRecordRow, "created_by_user_id" | "updated_by_user_id">;

function developmentView(row: DevelopmentRecordRow): DevelopmentView {
  const { created_by_user_id: _created, updated_by_user_id: _updated, ...rest } = row;
  void _created;
  void _updated;
  return rest;
}

export async function listDevelopment(ctx: ServiceContext, input: { employeeUserId?: unknown; status?: unknown; type?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "development");
  const filters: DbFilter[] = [];
  if (input.employeeUserId) {
    const employee = await requireEmployeeInScope(ctx, requireUuid(input.employeeUserId, "team member"));
    filters.push({ column: "employee_user_id", op: "eq", value: employee.userId });
  } else {
    filters.push(...departmentOverlapFilter("employee_departments", scopeFilterDepartments(ctx.actor)));
  }
  if (typeof input.status === "string" && (DEVELOPMENT_STATUSES as readonly string[]).includes(input.status)) {
    filters.push({ column: "status", op: "eq", value: input.status });
  }
  if (typeof input.type === "string" && (DEVELOPMENT_RECORD_TYPES as readonly string[]).includes(input.type)) {
    filters.push({ column: "record_type", op: "eq", value: input.type });
  }
  const { rows } = await ctx.db.select<DevelopmentRecordRow>("team_engagement_development_records", {
    filters,
    order: [{ column: "updated_at", ascending: false }],
    limit: LIST_CAP
  });
  const directory = await ctx.directory();
  const visible = rows.filter((row) => {
    const employee = directory.byId.get(row.employee_user_id);
    return employee ? canViewEmployee(ctx.actor, employee) : false;
  });
  return { items: visible.map(developmentView) };
}

export async function saveDevelopmentRecord(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  await requireFeature(ctx, "development");
  const recordType = oneOf(input.recordType, DEVELOPMENT_RECORD_TYPES, "record type");
  const status = oneOf(input.status ?? "in_progress", DEVELOPMENT_STATUSES, "status");
  const visibility = oneOf(input.visibility ?? "leadership", DEVELOPMENT_VISIBILITIES, "visibility");
  const title = text(input.title, 160);
  if (title.length < 2) throw validationError("Give the record a short title.");
  const details = optionalText(input.details, 2000);
  const dueOn = isoDate(input.dueOn, "due date");
  const at = nowIso(ctx);

  if (input.id) {
    const id = requireUuid(input.id, "record");
    const { rows } = await ctx.db.select<DevelopmentRecordRow>("team_engagement_development_records", {
      filters: [{ column: "id", op: "eq", value: id }],
      limit: 1
    });
    const existing = rows[0];
    if (!existing) throw notFoundError("That development record");
    const employee = await requireEmployeeInScope(ctx, existing.employee_user_id);
    const completedAt = status === "completed" ? existing.completed_at ?? at : null;
    const [updated] = await ctx.db.commit([
      {
        op: "update",
        table: "team_engagement_development_records",
        match: { id, updated_at: existing.updated_at },
        set: {
          record_type: recordType,
          status,
          visibility,
          title,
          details,
          due_on: dueOn,
          completed_at: completedAt,
          employee_departments: employee.departments,
          updated_by_user_id: ctx.actor.userId,
          updated_by_name: ctx.actor.name,
          updated_at: at
        },
        expectRows: 1
      },
      auditOp(ctx, {
        category: "engagement",
        action: "development.update",
        targetType: "development_record",
        targetId: id,
        targetLabel: `${employee.name} · ${title}`,
        scope: departmentsLabel(employee.departments),
        previous: { type: existing.record_type, status: existing.status, visibility: existing.visibility, dueOn: existing.due_on },
        next: { type: recordType, status, visibility, dueOn }
      })
    ]);
    return { record: developmentView(updated![0] as unknown as DevelopmentRecordRow) };
  }

  const employee = await requireEmployeeInScope(ctx, requireUuid(input.employeeUserId, "team member"));
  const id = randomUUID();
  const row: DevelopmentRecordRow = {
    id,
    employee_user_id: employee.userId,
    employee_name: employee.name,
    employee_departments: employee.departments,
    record_type: recordType,
    title,
    details,
    status,
    visibility,
    due_on: dueOn,
    completed_at: status === "completed" ? at : null,
    created_by_user_id: ctx.actor.userId,
    created_by_name: ctx.actor.name,
    updated_by_user_id: null,
    updated_by_name: null,
    created_at: at,
    updated_at: at
  };
  await ctx.db.commit([
    { op: "insert", table: "team_engagement_development_records", values: row },
    auditOp(ctx, {
      category: "engagement",
      action: "development.create",
      targetType: "development_record",
      targetId: id,
      targetLabel: `${employee.name} · ${title}`,
      scope: departmentsLabel(employee.departments),
      next: { type: recordType, status, visibility, dueOn }
    })
  ]);
  return { record: developmentView(row) };
}

// ---------------------------------------------------------------------------------------------
// Feedback & suggestions
// ---------------------------------------------------------------------------------------------

export type FeedbackView = FeedbackRow & { events: FeedbackEventRow[] };

export async function submitFeedback(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  await requireFeature(ctx, "feedback");
  const category = oneOf(input.category, FEEDBACK_CATEGORIES, "category");
  const aboutDepartment =
    input.aboutDepartment === null || input.aboutDepartment === undefined || input.aboutDepartment === ""
      ? null
      : oneOf(input.aboutDepartment, ENGAGEMENT_DEPARTMENTS, "department");
  const subject = text(input.subject, 160);
  const details = multilineText(input.details, 3000);
  if (subject.length < 3) throw validationError("Add a short subject.");
  if (details.length < 10) throw validationError("Share a few more details so leadership can follow up.");

  const { total } = await ctx.db.select<FeedbackRow>("team_engagement_feedback", {
    filters: [
      { column: "submitter_user_id", op: "eq", value: ctx.actor.userId },
      { column: "created_at", op: "gte", value: new Date(ctx.now().getTime() - 86_400_000).toISOString() }
    ],
    limit: 1,
    count: true
  });
  if ((total ?? 0) >= 10) throw new EngagementError(429, "daily_limit", "You can share 10 suggestions a day. Try again tomorrow.");

  const at = nowIso(ctx);
  const id = randomUUID();
  const row: FeedbackRow = {
    id,
    submitter_user_id: ctx.actor.userId,
    submitter_name: ctx.actor.name,
    submitter_departments: ctx.actor.departments,
    category,
    about_department: aboutDepartment,
    subject,
    details,
    status: "submitted",
    assigned_to_user_id: null,
    assigned_to_name: null,
    follow_up_on: null,
    resolution: null,
    resolved_at: null,
    created_at: at,
    updated_at: at
  };
  await ctx.db.commit([
    { op: "insert", table: "team_engagement_feedback", values: row },
    {
      op: "insert",
      table: "team_engagement_feedback_events",
      values: {
        id: randomUUID(),
        feedback_id: id,
        event_type: "submitted",
        body: null,
        visible_to_submitter: true,
        from_status: null,
        to_status: "submitted",
        actor_user_id: ctx.actor.userId,
        actor_name: ctx.actor.name,
        created_at: at
      }
    }
  ]);
  return { feedback: { ...row, events: [] } };
}

async function eventsFor(ctx: ServiceContext, ids: string[], submitterView: boolean) {
  if (!ids.length) return new Map<string, FeedbackEventRow[]>();
  const filters: DbFilter[] = [{ column: "feedback_id", op: "in", value: ids }];
  if (submitterView) filters.push({ column: "visible_to_submitter", op: "eq", value: true });
  const { rows } = await ctx.db.select<FeedbackEventRow>("team_engagement_feedback_events", {
    filters,
    order: [{ column: "created_at", ascending: true }],
    limit: 1000
  });
  const map = new Map<string, FeedbackEventRow[]>();
  for (const row of rows) {
    const view = submitterView ? { ...row, actor_user_id: null } : row;
    map.set(row.feedback_id, [...(map.get(row.feedback_id) ?? []), view]);
  }
  return map;
}

export async function myFeedback(ctx: ServiceContext) {
  requireStorage(ctx);
  const { rows } = await ctx.db.select<FeedbackRow>("team_engagement_feedback", {
    filters: [{ column: "submitter_user_id", op: "eq", value: ctx.actor.userId }],
    order: [{ column: "created_at", ascending: false }],
    limit: 50
  });
  const events = await eventsFor(
    ctx,
    rows.map((row) => row.id),
    true
  );
  return {
    items: rows.map((row) => ({
      ...row,
      assigned_to_user_id: null,
      assigned_to_name: null,
      follow_up_on: null,
      events: events.get(row.id) ?? []
    }))
  };
}

function feedbackInScope(ctx: ServiceContext, row: FeedbackRow) {
  return ctx.actor.scope.all || inScope(ctx.actor, row.submitter_departments);
}

export async function listFeedback(ctx: ServiceContext, input: { status?: unknown; category?: unknown; department?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "feedback");
  const filters: DbFilter[] = [];
  if (typeof input.status === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(input.status)) {
    filters.push({ column: "status", op: "eq", value: input.status });
  } else if (input.status === "open") {
    filters.push({ column: "status", op: "in", value: ["submitted", "under_review", "planned"] });
  }
  if (typeof input.category === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(input.category)) {
    filters.push({ column: "category", op: "eq", value: input.category });
  }
  const scoped = scopeFilterDepartments(ctx.actor);
  if (scoped) {
    if (!scoped.length) return { items: [] };
    filters.push({ column: "submitter_departments", op: "ov", value: scoped });
  }
  if (typeof input.department === "string" && isEngagementDepartment(input.department)) {
    if (scoped && !scoped.includes(input.department)) throw forbiddenError();
    filters.push(
      scoped
        ? { column: "submitter_departments", op: "ov", value: [input.department] }
        : {
            op: "or",
            filters: [
              { column: "submitter_departments", op: "ov", value: [input.department] },
              { column: "about_department", op: "eq", value: input.department }
            ]
          }
    );
  }
  const { rows } = await ctx.db.select<FeedbackRow>("team_engagement_feedback", {
    filters,
    order: [{ column: "created_at", ascending: false }],
    limit: LIST_CAP
  });
  const visible: FeedbackRow[] = [];
  for (const row of rows) {
    if (row.submitter_user_id === ctx.actor.userId) continue;
    if (await visibleToLeader(ctx, row.submitter_user_id)) visible.push(row);
  }
  const events = await eventsFor(
    ctx,
    visible.map((row) => row.id),
    false
  );
  return { items: visible.map((row) => ({ ...row, events: events.get(row.id) ?? [] })) };
}

async function feedbackForLeader(ctx: ServiceContext, idValue: unknown): Promise<FeedbackRow> {
  const id = requireUuid(idValue, "suggestion");
  const { rows } = await ctx.db.select<FeedbackRow>("team_engagement_feedback", {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1
  });
  const row = rows[0];
  if (!row || row.submitter_user_id === ctx.actor.userId) throw notFoundError("That suggestion");
  if (!feedbackInScope(ctx, row) || !(await visibleToLeader(ctx, row.submitter_user_id))) throw notFoundError("That suggestion");
  return row;
}

function feedbackEvent(ctx: ServiceContext, feedbackId: string, input: Partial<FeedbackEventRow> & { event_type: FeedbackEventRow["event_type"] }): DbOp {
  return {
    op: "insert",
    table: "team_engagement_feedback_events",
    values: {
      id: randomUUID(),
      feedback_id: feedbackId,
      body: null,
      visible_to_submitter: false,
      from_status: null,
      to_status: null,
      actor_user_id: ctx.actor.userId,
      actor_name: ctx.actor.name,
      created_at: nowIso(ctx),
      ...input
    }
  };
}

export async function respondToFeedback(ctx: ServiceContext, input: { id?: unknown; body?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "feedback");
  const row = await feedbackForLeader(ctx, input.id);
  const body = multilineText(input.body, 3000);
  if (body.length < 3) throw validationError("Write a response for the team member.");
  const at = nowIso(ctx);
  const nextStatus = row.status === "submitted" ? "under_review" : row.status;
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_feedback",
      match: { id: row.id, updated_at: row.updated_at },
      set: { status: nextStatus, updated_at: at },
      expectRows: 1
    },
    feedbackEvent(ctx, row.id, {
      event_type: "response",
      body,
      visible_to_submitter: true,
      from_status: row.status,
      to_status: nextStatus
    }),
    auditOp(ctx, {
      category: "engagement",
      action: "feedback.respond",
      targetType: "feedback",
      targetId: row.id,
      targetLabel: row.subject,
      scope: departmentsLabel(row.submitter_departments),
      previous: { status: row.status },
      next: { status: nextStatus }
    })
  ]);
  if (row.submitter_user_id) {
    try {
      await ctx.notify({
        recipientUserId: row.submitter_user_id,
        title: "Leadership responded to your suggestion",
        body: `${ctx.actor.name} replied to “${row.subject}”.`,
        dedupeKey: `feedback:${row.id}:response:${at}`
      });
    } catch {
      // Notifications never block the response.
    }
  }
  return { id: row.id, status: nextStatus };
}

export async function updateFeedback(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  await requireFeature(ctx, "feedback");
  const row = await feedbackForLeader(ctx, input.id);
  const status = input.status === undefined ? row.status : oneOf(input.status, FEEDBACK_STATUSES, "status");
  const resolution = input.resolution === undefined ? row.resolution : optionalText(input.resolution, 2000);
  if ((status === "resolved" || status === "declined") && (!resolution || resolution.length < 5)) {
    throw validationError("Explain the outcome so the team member knows what happened.");
  }
  const followUpOn = input.followUpOn === undefined ? row.follow_up_on : isoDate(input.followUpOn, "follow-up date");
  let assignedId = row.assigned_to_user_id;
  let assignedName = row.assigned_to_name;
  if (input.assignedToUserId !== undefined) {
    if (input.assignedToUserId === null || input.assignedToUserId === "") {
      assignedId = null;
      assignedName = null;
    } else {
      const assignee = (await ctx.directory()).byId.get(requireUuid(input.assignedToUserId, "assignee"));
      if (!assignee || !assignee.active || !assignee.tier) throw validationError("Assign suggestions to an active leader.");
      assignedId = assignee.userId;
      assignedName = assignee.name;
    }
  }
  const at = nowIso(ctx);
  const ops: DbOp[] = [
    {
      op: "update",
      table: "team_engagement_feedback",
      match: { id: row.id, updated_at: row.updated_at },
      set: {
        status,
        resolution,
        resolved_at: status === "resolved" || status === "declined" ? row.resolved_at ?? at : null,
        follow_up_on: followUpOn,
        assigned_to_user_id: assignedId,
        assigned_to_name: assignedName,
        updated_at: at
      },
      expectRows: 1
    }
  ];
  if (status !== row.status) {
    ops.push(
      feedbackEvent(ctx, row.id, {
        event_type: "status_changed",
        body: status === "resolved" || status === "declined" ? resolution : null,
        visible_to_submitter: true,
        from_status: row.status,
        to_status: status
      })
    );
  }
  if (assignedId !== row.assigned_to_user_id) {
    ops.push(feedbackEvent(ctx, row.id, { event_type: "assigned", body: assignedName ? `Assigned to ${assignedName}` : "Unassigned" }));
  }
  if (followUpOn !== row.follow_up_on) {
    ops.push(feedbackEvent(ctx, row.id, { event_type: "follow_up_set", body: followUpOn ? `Follow up on ${followUpOn}` : "Follow-up cleared" }));
  }
  ops.push(
    auditOp(ctx, {
      category: "engagement",
      action: "feedback.update",
      targetType: "feedback",
      targetId: row.id,
      targetLabel: row.subject,
      scope: departmentsLabel(row.submitter_departments),
      previous: { status: row.status, assignedTo: row.assigned_to_name, followUpOn: row.follow_up_on },
      next: { status, assignedTo: assignedName, followUpOn }
    })
  );
  await ctx.db.commit(ops);
  if (status !== row.status && row.submitter_user_id) {
    try {
      await ctx.notify({
        recipientUserId: row.submitter_user_id,
        title: "Your suggestion has an update",
        body: `“${row.subject}” is now ${status.replace(/_/g, " ")}.`,
        dedupeKey: `feedback:${row.id}:status:${status}`
      });
    } catch {
      // Notifications never block the update.
    }
  }
  return { id: row.id, status };
}

export async function noteFeedback(ctx: ServiceContext, input: { id?: unknown; body?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "feedback");
  const row = await feedbackForLeader(ctx, input.id);
  const body = multilineText(input.body, 3000);
  if (body.length < 3) throw validationError("Write the internal note.");
  await ctx.db.commit([feedbackEvent(ctx, row.id, { event_type: "internal_note", body, visible_to_submitter: false })]);
  return { id: row.id };
}

// ---------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------

export async function listAnnouncements(ctx: ServiceContext, input: { includeArchived?: unknown }) {
  requireStorage(ctx);
  const filters: DbFilter[] = input.includeArchived ? [] : [{ column: "status", op: "eq", value: "published" }];
  const { rows } = await ctx.db.select<AnnouncementRow>("team_engagement_announcements", {
    filters,
    order: [{ column: "published_at", ascending: false }],
    limit: 200
  });
  const scoped = scopeFilterDepartments(ctx.actor);
  const items = rows.filter(
    (row) => !scoped || row.audience_departments.length === 0 || row.audience_departments.some((key) => scoped.includes(key))
  );
  return {
    items: items.map((row) => ({
      ...row,
      canArchive: row.status === "published" && (row.created_by_user_id === ctx.actor.userId || tierRank(ctx.actor.tier) >= tierRank("admin"))
    }))
  };
}

export async function createAnnouncement(ctx: ServiceContext, input: { title?: unknown; body?: unknown; audienceDepartments?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "announcements");
  const title = text(input.title, 140);
  const body = multilineText(input.body, 4000);
  if (title.length < 3) throw validationError("Add a title.");
  if (body.length < 3) throw validationError("Write the announcement.");
  const audience = Array.isArray(input.audienceDepartments)
    ? [...new Set(input.audienceDepartments.filter(isEngagementDepartment))]
    : [];
  const scoped = scopeFilterDepartments(ctx.actor);
  if (scoped) {
    if (!audience.length) throw validationError("Choose which of your departments should see this.");
    if (audience.some((key) => !scoped.includes(key))) throw forbiddenError();
  }
  const at = nowIso(ctx);
  const id = randomUUID();
  const row: AnnouncementRow = {
    id,
    title,
    body,
    audience_departments: audience,
    status: "published",
    created_by_user_id: ctx.actor.userId,
    created_by_name: ctx.actor.name,
    published_at: at,
    archived_at: null,
    created_at: at,
    updated_at: at
  };
  await ctx.db.commit([
    { op: "insert", table: "team_engagement_announcements", values: row },
    auditOp(ctx, {
      category: "engagement",
      action: "announcement.create",
      targetType: "announcement",
      targetId: id,
      targetLabel: title,
      scope: departmentsLabel(audience),
      next: { audience: audience.length ? audience : "everyone" }
    })
  ]);
  return { announcement: row };
}

export async function archiveAnnouncement(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  const id = requireUuid(input.id, "announcement");
  const { rows } = await ctx.db.select<AnnouncementRow>("team_engagement_announcements", {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1
  });
  const row = rows[0];
  if (!row) throw notFoundError("That announcement");
  const scoped = scopeFilterDepartments(ctx.actor);
  if (scoped && row.audience_departments.length && !row.audience_departments.some((key) => scoped.includes(key))) {
    throw notFoundError("That announcement");
  }
  if (row.created_by_user_id !== ctx.actor.userId && tierRank(ctx.actor.tier) < tierRank("admin")) throw forbiddenError();
  if (row.status !== "published") throw conflictError("This announcement is already archived.");
  const at = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_announcements",
      match: { id, status: "published" },
      set: { status: "archived", archived_at: at, updated_at: at },
      expectRows: 1
    },
    auditOp(ctx, {
      category: "engagement",
      action: "announcement.archive",
      targetType: "announcement",
      targetId: id,
      targetLabel: row.title,
      scope: departmentsLabel(row.audience_departments),
      previous: { status: "published" },
      next: { status: "archived" }
    })
  ]);
  return { id, status: "archived" };
}

export async function announcementsForEmployee(ctx: ServiceContext) {
  requireStorage(ctx);
  const settings = await ctx.settings();
  if (!settings.features.announcements) return { items: [] };
  const { rows } = await ctx.db.select<AnnouncementRow>("team_engagement_announcements", {
    filters: [{ column: "status", op: "eq", value: "published" }],
    order: [{ column: "published_at", ascending: false }],
    limit: 50
  });
  const mine = ctx.actor.departments as string[];
  return {
    items: rows
      .filter((row) => row.audience_departments.length === 0 || row.audience_departments.some((key) => mine.includes(key)))
      .slice(0, 10)
      .map((row) => ({ id: row.id, title: row.title, body: row.body, publishedAt: row.published_at, author: row.created_by_name }))
  };
}

// ---------------------------------------------------------------------------------------------
// Recognition programs & nominations
// ---------------------------------------------------------------------------------------------

export function periodLabelFor(cadence: ProgramCadence, now: Date) {
  const year = now.getUTCFullYear();
  if (cadence === "monthly") return `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (cadence === "quarterly") return `${year}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  if (cadence === "annual") return String(year);
  return "ongoing";
}

export async function listPrograms(ctx: ServiceContext) {
  requireStorage(ctx);
  const [programs, nominations, directory] = await Promise.all([
    ctx.db.select<ProgramRow>("team_engagement_programs", { order: [{ column: "name", ascending: true }], limit: 200 }),
    ctx.db.select<NominationRow>("team_engagement_nominations", {
      filters: departmentOverlapFilter("nominee_departments", scopeFilterDepartments(ctx.actor)),
      order: [{ column: "created_at", ascending: false }],
      limit: LIST_CAP
    }),
    ctx.directory()
  ]);
  const visibleNominations = nominations.rows.filter((row) => {
    if (row.nominee_user_id === ctx.actor.userId) return false;
    if (row.nominated_by_user_id === ctx.actor.userId) return true;
    const nominee = directory.byId.get(row.nominee_user_id);
    return nominee ? canViewEmployee(ctx.actor, nominee) : false;
  });
  const canDecide = ctx.actor.permissions.includes("engagement.manage_programs");
  return {
    programs: programs.rows.map((program) => ({ ...program, typeLabel: PROGRAM_TYPE_LABELS[program.program_type] })),
    nominations: visibleNominations.map((row) => ({
      ...row,
      canWithdraw: row.nominated_by_user_id === ctx.actor.userId && (row.status === "submitted" || row.status === "under_review"),
      canDecide:
        canDecide &&
        row.nominated_by_user_id !== ctx.actor.userId &&
        (row.status === "submitted" || row.status === "under_review")
    }))
  };
}

export async function saveProgram(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  await requireFeature(ctx, "programs");
  const programType = oneOf(input.programType, PROGRAM_TYPES, "program type");
  const name = text(input.name, 120);
  if (name.length < 3) throw validationError("Name the program.");
  const description = optionalText(input.description, 1000);
  const criteria = optionalText(input.criteria, 1500);
  const cadence = oneOf(input.cadence ?? "monthly", PROGRAM_CADENCES, "cadence");
  const status = oneOf(input.status ?? "active", PROGRAM_STATUSES, "status");
  const nominationsOpen = input.nominationsOpen !== false;
  const at = nowIso(ctx);
  const values = {
    program_type: programType,
    name,
    description,
    criteria,
    cadence,
    status,
    nominations_open: status === "active" ? nominationsOpen : false
  };

  if (input.id) {
    const id = requireUuid(input.id, "program");
    const { rows } = await ctx.db.select<ProgramRow>("team_engagement_programs", { filters: [{ column: "id", op: "eq", value: id }], limit: 1 });
    const existing = rows[0];
    if (!existing) throw notFoundError("That program");
    const [updated] = await ctx.db.commit([
      {
        op: "update",
        table: "team_engagement_programs",
        match: { id, updated_at: existing.updated_at },
        set: { ...values, updated_by_user_id: ctx.actor.userId, updated_by_name: ctx.actor.name, updated_at: at },
        expectRows: 1
      },
      auditOp(ctx, {
        category: "configuration",
        action: "program.update",
        targetType: "program",
        targetId: id,
        targetLabel: name,
        previous: {
          name: existing.name,
          type: existing.program_type,
          cadence: existing.cadence,
          status: existing.status,
          nominationsOpen: existing.nominations_open,
          criteria: existing.criteria
        },
        next: { name, type: programType, cadence, status, nominationsOpen: values.nominations_open, criteria }
      })
    ]);
    return { program: updated![0] as unknown as ProgramRow };
  }

  const id = randomUUID();
  const row: ProgramRow = {
    id,
    ...values,
    created_by_user_id: ctx.actor.userId,
    created_by_name: ctx.actor.name,
    updated_by_user_id: null,
    updated_by_name: null,
    created_at: at,
    updated_at: at
  };
  await ctx.db.commit([
    { op: "insert", table: "team_engagement_programs", values: row },
    auditOp(ctx, {
      category: "configuration",
      action: "program.create",
      targetType: "program",
      targetId: id,
      targetLabel: name,
      next: { name, type: programType, cadence, status, nominationsOpen: values.nominations_open, criteria }
    })
  ]);
  return { program: row };
}

export async function nominate(ctx: ServiceContext, input: { programId?: unknown; nomineeUserId?: unknown; reason?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "programs");
  const programId = requireUuid(input.programId, "program");
  const { rows } = await ctx.db.select<ProgramRow>("team_engagement_programs", { filters: [{ column: "id", op: "eq", value: programId }], limit: 1 });
  const program = rows[0];
  if (!program) throw notFoundError("That program");
  if (program.status !== "active" || !program.nominations_open) throw validationError("Nominations for this program are closed.");
  const nominee = await requireEmployeeInScope(ctx, requireUuid(input.nomineeUserId, "nominee"));
  const reason = multilineText(input.reason, 2000);
  if (reason.length < 20) throw validationError("Explain what this person did — at least a couple of sentences.");
  const at = nowIso(ctx);
  const id = randomUUID();
  const row: NominationRow = {
    id,
    program_id: program.id,
    nominee_user_id: nominee.userId,
    nominee_name: nominee.name,
    nominee_departments: nominee.departments,
    nominated_by_user_id: ctx.actor.userId,
    nominated_by_name: ctx.actor.name,
    period_label: periodLabelFor(program.cadence, ctx.now()),
    reason,
    status: "submitted",
    decision_note: null,
    decided_by_user_id: null,
    decided_by_name: null,
    decided_at: null,
    created_at: at,
    updated_at: at
  };
  try {
    await ctx.db.commit([
      { op: "insert", table: "team_engagement_nominations", values: row },
      auditOp(ctx, {
        category: "engagement",
        action: "nomination.create",
        targetType: "nomination",
        targetId: id,
        targetLabel: `${nominee.name} · ${program.name} (${row.period_label})`,
        scope: departmentsLabel(nominee.departments),
        next: { status: "submitted" }
      })
    ]);
  } catch (error) {
    if (error instanceof EngagementError && error.code === "duplicate") {
      throw new EngagementError(409, "duplicate", `${nominee.name} is already nominated for ${program.name} this period.`);
    }
    throw error;
  }
  return { nomination: row };
}

async function getNomination(ctx: ServiceContext, idValue: unknown) {
  const id = requireUuid(idValue, "nomination");
  const { rows } = await ctx.db.select<NominationRow>("team_engagement_nominations", { filters: [{ column: "id", op: "eq", value: id }], limit: 1 });
  const row = rows[0];
  if (!row) throw notFoundError("That nomination");
  return row;
}

export async function withdrawNomination(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  const row = await getNomination(ctx, input.id);
  if (row.nominated_by_user_id !== ctx.actor.userId) throw notFoundError("That nomination");
  if (row.status !== "submitted" && row.status !== "under_review") throw conflictError("This nomination was already decided.");
  const at = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_nominations",
      match: { id: row.id, status: row.status },
      set: { status: "withdrawn", updated_at: at },
      expectRows: 1
    },
    auditOp(ctx, {
      category: "engagement",
      action: "nomination.withdraw",
      targetType: "nomination",
      targetId: row.id,
      targetLabel: `${row.nominee_name} (${row.period_label})`,
      previous: { status: row.status },
      next: { status: "withdrawn" }
    })
  ]);
  return { id: row.id, status: "withdrawn" };
}

export async function decideNomination(ctx: ServiceContext, input: { id?: unknown; decision?: unknown; note?: unknown }) {
  requireStorage(ctx);
  await requireFeature(ctx, "programs");
  const row = await getNomination(ctx, input.id);
  const decision = oneOf(input.decision, ["under_review", "selected", "not_selected"] as const, "decision");
  if (row.nominated_by_user_id === ctx.actor.userId) {
    throw new EngagementError(403, "forbidden", "Someone other than the nominator records the decision.");
  }
  const nominee = await requireEmployeeInScope(ctx, row.nominee_user_id).catch(() => {
    throw notFoundError("That nomination");
  });
  if (row.status !== "submitted" && row.status !== "under_review") throw conflictError("This nomination was already decided.");
  const note = optionalText(input.note, 2000);
  if (decision !== "under_review" && (!note || note.length < 10)) {
    throw validationError("Record why this decision was made. Program decisions are reviewed, not automatic.");
  }
  const at = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_nominations",
      match: { id: row.id, status: row.status },
      set: {
        status: decision,
        decision_note: note ?? row.decision_note,
        decided_by_user_id: decision === "under_review" ? null : ctx.actor.userId,
        decided_by_name: decision === "under_review" ? null : ctx.actor.name,
        decided_at: decision === "under_review" ? null : at,
        updated_at: at
      },
      expectRows: 1
    },
    auditOp(ctx, {
      category: "engagement",
      action: `nomination.${decision}`,
      targetType: "nomination",
      targetId: row.id,
      targetLabel: `${row.nominee_name} (${row.period_label})`,
      scope: departmentsLabel(row.nominee_departments),
      previous: { status: row.status },
      next: { status: decision },
      reason: note
    })
  ]);
  if (decision === "selected") {
    try {
      await ctx.notify({
        recipientUserId: nominee.userId,
        title: "You were selected for a recognition program",
        body: `Congratulations! You were selected (${row.period_label}).`,
        dedupeKey: `nomination:${row.id}:selected`
      });
    } catch {
      // Notifications never block the decision.
    }
  }
  return { id: row.id, status: decision };
}

export async function recognitionForEmployee(ctx: ServiceContext) {
  requireStorage(ctx);
  const [nominations, programs] = await Promise.all([
    ctx.db.select<NominationRow>("team_engagement_nominations", {
      filters: [
        { column: "nominee_user_id", op: "eq", value: ctx.actor.userId },
        { column: "status", op: "eq", value: "selected" }
      ],
      order: [{ column: "decided_at", ascending: false }],
      limit: 20
    }),
    ctx.db.select<ProgramRow>("team_engagement_programs", { limit: 200 })
  ]);
  const names = new Map(programs.rows.map((program) => [program.id, program.name]));
  return {
    items: nominations.rows.map((row) => ({
      id: row.id,
      programName: names.get(row.program_id) ?? "Recognition program",
      periodLabel: row.period_label,
      decidedAt: row.decided_at
    }))
  };
}

export async function sharedDevelopmentForEmployee(ctx: ServiceContext) {
  requireStorage(ctx);
  const settings = await ctx.settings();
  if (!settings.features.development) return { items: [] };
  const { rows } = await ctx.db.select<DevelopmentRecordRow>("team_engagement_development_records", {
    filters: [
      { column: "employee_user_id", op: "eq", value: ctx.actor.userId },
      { column: "visibility", op: "eq", value: "shared_with_employee" }
    ],
    order: [{ column: "updated_at", ascending: false }],
    limit: 50
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      recordType: row.record_type,
      title: row.title,
      details: row.details,
      status: row.status,
      dueOn: row.due_on,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    }))
  };
}

// ---------------------------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------------------------

export async function departmentProfiles(ctx: ServiceContext) {
  const [profiles, managers] = await Promise.all([
    ctx.db.select<DepartmentProfileRow>("team_engagement_department_profiles"),
    ctx.db.select<DepartmentManagerRow>("team_engagement_department_managers", { limit: 1000 })
  ]);
  return { profiles: profiles.rows, managers: managers.rows };
}

export function departmentsInScope(ctx: ServiceContext): DepartmentKey[] {
  return ctx.actor.scope.all ? ENGAGEMENT_DEPARTMENTS : ctx.actor.scope.departments;
}

export async function saveDepartment(ctx: ServiceContext, input: { key?: unknown; description?: unknown; recognitionEnabled?: unknown }) {
  requireStorage(ctx);
  const key = oneOf(input.key, ENGAGEMENT_DEPARTMENTS, "department");
  const description = optionalText(input.description, 600);
  const recognitionEnabled = input.recognitionEnabled !== false;
  const { rows } = await ctx.db.select<DepartmentProfileRow>("team_engagement_department_profiles", {
    filters: [{ column: "department_key", op: "eq", value: key }],
    limit: 1
  });
  const existing = rows[0];
  const at = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_department_profiles",
      conflict: ["department_key"],
      values: {
        department_key: key,
        description,
        recognition_enabled: recognitionEnabled,
        updated_by_user_id: ctx.actor.userId,
        updated_by_name: ctx.actor.name,
        updated_at: at
      }
    },
    auditOp(ctx, {
      category: "configuration",
      action: "department.update",
      targetType: "department",
      targetId: key,
      targetLabel: departmentLabel(key),
      scope: departmentLabel(key),
      previous: existing ? { description: existing.description, recognitionEnabled: existing.recognition_enabled } : null,
      next: { description, recognitionEnabled }
    })
  ]);
  return { key };
}

export async function assignDepartmentManager(ctx: ServiceContext, input: { key?: unknown; userId?: unknown }, assign: boolean) {
  requireStorage(ctx);
  const key = oneOf(input.key, OPERATIONAL_DEPARTMENTS, "department");
  const userId = requireUuid(input.userId, "manager");
  if (userId === ctx.actor.userId) throw new EngagementError(403, "forbidden", "Someone else assigns your departments.");
  const manager: EngagementEmployee | undefined = (await ctx.directory()).byId.get(userId);
  if (!manager) throw notFoundError("That manager");
  const at = nowIso(ctx);
  if (assign) {
    if (!manager.active || manager.tier !== "management") {
      throw validationError("Department managers must be active Management accounts. Admins already see every department.");
    }
    try {
      await ctx.db.commit([
        {
          op: "insert",
          table: "team_engagement_department_managers",
          values: { department_key: key, manager_user_id: userId, assigned_by_user_id: ctx.actor.userId, assigned_by_name: ctx.actor.name, created_at: at }
        },
        auditOp(ctx, {
          category: "access",
          action: "department.manager_assign",
          targetType: "department",
          targetId: key,
          targetLabel: `${manager.name} → ${departmentLabel(key)}`,
          scope: departmentLabel(key),
          next: { managerUserId: userId, department: key }
        })
      ]);
    } catch (error) {
      if (error instanceof EngagementError && error.code === "duplicate") throw new EngagementError(409, "duplicate", `${manager.name} already leads ${departmentLabel(key)}.`);
      throw error;
    }
    return { key, userId, assigned: true };
  }
  await ctx.db.commit([
    { op: "delete", table: "team_engagement_department_managers", match: { department_key: key, manager_user_id: userId }, expectRows: 1 },
    auditOp(ctx, {
      category: "access",
      action: "department.manager_remove",
      targetType: "department",
      targetId: key,
      targetLabel: `${manager.name} → ${departmentLabel(key)}`,
      scope: departmentLabel(key),
      previous: { managerUserId: userId, department: key }
    })
  ]);
  return { key, userId, assigned: false };
}

// ---------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------

export async function myPreferences(ctx: ServiceContext) {
  requireStorage(ctx);
  const { rows } = await ctx.db.select<PreferenceRow>("team_engagement_preferences", {
    filters: [{ column: "user_id", op: "eq", value: ctx.actor.userId }],
    limit: 1
  });
  return { showOnTeamFeed: rows[0]?.show_on_team_feed !== false, notifyOnBarkOut: rows[0]?.notify_on_bark_out !== false };
}

export async function savePreferences(ctx: ServiceContext, input: { showOnTeamFeed?: unknown; notifyOnBarkOut?: unknown }) {
  requireStorage(ctx);
  const showOnTeamFeed = input.showOnTeamFeed !== false;
  const notifyOnBarkOut = input.notifyOnBarkOut !== false;
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_preferences",
      conflict: ["user_id"],
      values: { user_id: ctx.actor.userId, show_on_team_feed: showOnTeamFeed, notify_on_bark_out: notifyOnBarkOut, updated_at: nowIso(ctx) }
    }
  ]);
  return { showOnTeamFeed, notifyOnBarkOut };
}

