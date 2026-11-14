import { ADMIN_USER_ROLE_LABELS, type AdminUserRole } from "@/lib/admin/users";
import {
  BARK_OUT_STATUSES,
  BARK_OUT_STATUS_LABELS,
  DEVELOPMENT_RECORD_TYPES,
  DEVELOPMENT_RECORD_TYPE_LABELS,
  ENGAGEMENT_DEPARTMENTS,
  FEATURE_KEYS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  MODERATION_OUTCOMES,
  NOMINATION_STATUS_LABELS,
  RECENT_RECOGNITION_DAYS,
  departmentLabel,
  isEngagementDepartment,
  type BarkOutStatus
} from "@/lib/team-engagement/constants";
import { barkOutViews } from "@/lib/team-engagement/bark-outs";
import {
  addDaysToDateKey,
  auditOp,
  canViewEmployee,
  daysAgoIso,
  departmentsLabel,
  isoDate,
  pacificDateRange,
  requireStorage,
  requireUuid,
  scopeFilterDepartments,
  scopeLabel,
  type ServiceContext,
  type WorkItem
} from "@/lib/team-engagement/context";
import { selectAll } from "@/lib/team-engagement/db";
import { EngagementError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { TIER_LABELS, tierRank, type EngagementPermission } from "@/lib/team-engagement/permissions";
import type {
  AnnouncementRow,
  AuditEventRow,
  BarkOutRow,
  ConcernReportRow,
  DbFilter,
  DepartmentManagerRow,
  DevelopmentRecordRow,
  EngagementEmployee,
  EngagementTable,
  FeedbackRow,
  NominationRow,
  ProgramRow
} from "@/lib/team-engagement/types";
import { pacificDateKey, pacificTodayKey } from "@/lib/user-interactions/pacific";

const BARK_OUT_STAT_COLUMNS = [
  "id",
  "author_user_id",
  "author_name",
  "author_departments",
  "recipient_user_id",
  "recipient_name",
  "recipient_departments",
  "category",
  "status",
  "moderation_outcome",
  "escalated_at",
  "open_report_count",
  "published_at",
  "decided_at",
  "decided_by_name",
  "created_at"
] as const;

type BarkOutStat = Pick<BarkOutRow, (typeof BARK_OUT_STAT_COLUMNS)[number]>;

const MAX_RANGE_DAYS = 366;

async function all<T>(ctx: ServiceContext, table: EngagementTable, query: Parameters<typeof selectAll>[2]): Promise<T[]> {
  return (await selectAll<T>(ctx.db, table, query)).rows;
}
const WORKLOAD_NOTE = "Open assignments are a snapshot of current work, listed alphabetically. They are not a performance measure.";

export type DateRange = { from: string; to: string; days: number; startIso: string; endIso: string };

export function parseRange(ctx: ServiceContext, input: { from?: unknown; to?: unknown }, defaultDays = 90): DateRange {
  const today = pacificTodayKey(ctx.now());
  const to = isoDate(input.to, "end date") ?? today;
  const from = isoDate(input.from, "start date") ?? addDaysToDateKey(to, -(defaultDays - 1));
  if (from > to) throw validationError("The start date must be on or before the end date.");
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) throw validationError("Choose a range of one year or less.");
  return { from, to, days, ...pacificDateRange(from, to) };
}

function departmentFilterValue(ctx: ServiceContext, value: unknown): string | null {
  if (value === undefined || value === null || value === "" || value === "all") return null;
  if (!isEngagementDepartment(value)) throw validationError("Choose a valid department.");
  const scoped = scopeFilterDepartments(ctx.actor);
  if (scoped && !scoped.includes(value)) throw forbiddenError();
  return value;
}

function barkOutScopeFilters(ctx: ServiceContext, department: string | null): DbFilter[] {
  const departments = department ? [department] : scopeFilterDepartments(ctx.actor);
  if (!departments) return [];
  if (!departments.length) return [{ column: "id", op: "is_null" }];
  return [
    {
      op: "or",
      filters: [
        { column: "recipient_departments", op: "ov", value: departments },
        { column: "author_departments", op: "ov", value: departments }
      ]
    }
  ];
}

function overlapFilter(column: string, ctx: ServiceContext, department: string | null): DbFilter[] {
  const departments = department ? [department] : scopeFilterDepartments(ctx.actor);
  if (!departments) return [];
  if (!departments.length) return [{ column: "id", op: "is_null" }];
  return [{ column, op: "ov", value: departments }];
}

async function teamMembers(ctx: ServiceContext, department: string | null, includeInactive = false) {
  const directory = await ctx.directory();
  return directory.employees.filter(
    (employee) =>
      (includeInactive || employee.active) &&
      canViewEmployee(ctx.actor, employee) &&
      (!department || (employee.departments as string[]).includes(department))
  );
}

function departmentsInView(ctx: ServiceContext, department: string | null) {
  if (department) return [department];
  return ctx.actor.scope.all ? [...ENGAGEMENT_DEPARTMENTS] : [...ctx.actor.scope.departments];
}

function roleLabel(legacyRole: string) {
  return ADMIN_USER_ROLE_LABELS[legacyRole as AdminUserRole] ?? legacyRole.replace(/_/g, " ");
}

function personSummary(employee: EngagementEmployee) {
  return {
    userId: employee.userId,
    name: employee.name,
    title: employee.title,
    departmentLabel: employee.departmentLabel,
    departments: employee.departments.map((key) => ({ key, label: departmentLabel(key) })),
    roleLabel: roleLabel(employee.legacyRole),
    tierLabel: employee.tier ? TIER_LABELS[employee.tier] : null,
    active: employee.active
  };
}

function has(ctx: ServiceContext, permission: EngagementPermission) {
  return ctx.actor.permissions.includes(permission);
}

async function publishedSince(ctx: ServiceContext, sinceIso: string, department: string | null) {
  return all<BarkOutStat>(ctx, "team_engagement_bark_outs", {
    columns: BARK_OUT_STAT_COLUMNS,
    filters: [
      { column: "status", op: "eq", value: "published" },
      { column: "published_at", op: "gte", value: sinceIso },
      ...barkOutScopeFilters(ctx, department)
    ],
    order: [
      { column: "published_at", ascending: false },
      { column: "id", ascending: true }
    ]
  });
}

function isCrossDepartment(row: Pick<BarkOutRow, "author_departments" | "recipient_departments">) {
  if (!row.author_departments.length || !row.recipient_departments.length) return false;
  return !row.recipient_departments.some((key) => row.author_departments.includes(key));
}

function summarizeWork(items: WorkItem[], departments: string[]) {
  return departments.map((key) => {
    const scoped = items.filter((item) => item.department === key && item.open);
    return {
      key,
      label: departmentLabel(key),
      open: scoped.length,
      urgent: scoped.filter((item) => item.urgent).length,
      overdue: scoped.filter((item) => item.overdue).length,
      unassigned: scoped.filter((item) => !item.assigneeName).length
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export async function overview(ctx: ServiceContext) {
  requireStorage(ctx);
  const [team, settings, operations] = await Promise.all([teamMembers(ctx, null), ctx.settings(), ctx.operations().catch(() => null)]);
  const since60 = daysAgoIso(ctx, RECENT_RECOGNITION_DAYS * 2);
  const since30 = daysAgoIso(ctx, RECENT_RECOGNITION_DAYS);
  const today = pacificTodayKey(ctx.now());
  const soon = addDaysToDateKey(today, 14);

  const [published, recentRows, pendingCount, awaitingCount, reportedCount, escalatedCount, development, feedback, announcements] =
    await Promise.all([
      publishedSince(ctx, since60, null),
      ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
        filters: [{ column: "status", op: "eq", value: "published" }, ...barkOutScopeFilters(ctx, null)],
        order: [
          { column: "published_at", ascending: false },
          { column: "id", ascending: false }
        ],
        limit: 6
      }),
      has(ctx, "engagement.moderate")
        ? ctx.db.select("team_engagement_bark_outs", {
            filters: [{ column: "status", op: "eq", value: "pending_review" }, ...barkOutScopeFilters(ctx, null)],
            limit: 1,
            count: true
          })
        : null,
      has(ctx, "engagement.moderate")
        ? ctx.db.select("team_engagement_bark_outs", {
            filters: [{ column: "status", op: "eq", value: "awaiting_confirmation" }, ...barkOutScopeFilters(ctx, null)],
            limit: 1,
            count: true
          })
        : null,
      has(ctx, "engagement.moderate")
        ? ctx.db.select("team_engagement_bark_outs", {
            filters: [
              { column: "status", op: "in", value: ["published", "pending_review"] },
              { column: "open_report_count", op: "gt", value: 0 },
              ...barkOutScopeFilters(ctx, null)
            ],
            limit: 1,
            count: true
          })
        : null,
      has(ctx, "engagement.moderate")
        ? ctx.db.select("team_engagement_bark_outs", {
            filters: [
              { column: "status", op: "eq", value: "pending_review" },
              { column: "escalated_at", op: "not_null" },
              ...barkOutScopeFilters(ctx, null)
            ],
            limit: 1,
            count: true
          })
        : null,
      has(ctx, "engagement.manage_team") && settings.features.development
        ? all<DevelopmentRecordRow>(ctx, "team_engagement_development_records", {
            filters: [{ column: "status", op: "in", value: ["planned", "in_progress"] }, ...overlapFilter("employee_departments", ctx, null)],
            order: [
              { column: "due_on", ascending: true },
              { column: "id", ascending: true }
            ]
          })
        : [],
      has(ctx, "engagement.manage_team") && settings.features.feedback
        ? all<FeedbackRow>(ctx, "team_engagement_feedback", {
            filters: [
              { column: "status", op: "in", value: ["submitted", "under_review", "planned"] },
              ...overlapFilter("submitter_departments", ctx, null)
            ],
            order: [
              { column: "created_at", ascending: true },
              { column: "id", ascending: true }
            ]
          })
        : [],
      ctx.db.select<AnnouncementRow>("team_engagement_announcements", {
        filters: [{ column: "status", op: "eq", value: "published" }],
        order: [{ column: "published_at", ascending: false }],
        limit: 20
      })
    ]);

  const teamIds = new Set(team.map((employee) => employee.userId));
  const recent = published.filter((row) => row.published_at && row.published_at >= since30);
  const previous = published.filter((row) => row.published_at && row.published_at < since30);
  const lastRecognized = new Map<string, string>();
  for (const row of published) {
    if (!row.recipient_user_id || !row.published_at || row.published_at < since30) continue;
    const current = lastRecognized.get(row.recipient_user_id);
    if (!current || row.published_at > current) lastRecognized.set(row.recipient_user_id, row.published_at);
  }
  const recognized = team
    .filter((employee) => lastRecognized.has(employee.userId))
    .map((employee) => ({ ...personSummary(employee), lastRecognizedAt: lastRecognized.get(employee.userId)! }))
    .sort((a, b) => b.lastRecognizedAt.localeCompare(a.lastRecognizedAt));
  const notRecognized = team.filter((employee) => !lastRecognized.has(employee.userId)).map(personSummary);
  const authors = new Set(recent.map((row) => row.author_user_id).filter((id): id is string => Boolean(id && teamIds.has(id))));
  const recipients = new Set(recent.map((row) => row.recipient_user_id).filter((id): id is string => Boolean(id && teamIds.has(id))));

  const departments = departmentsInView(ctx, null);
  const headcount = departments.map((key) => ({
    key,
    label: departmentLabel(key),
    count: team.filter((employee) => (employee.departments as string[]).includes(key)).length
  }));

  const workItems = operations ? operations.items.filter((item) => item.department && departments.includes(item.department)) : [];
  const workload = operations
    ? { available: true, departments: summarizeWork(workItems, departments).filter((entry) => entry.open > 0), missing: operations.missing }
    : { available: false, departments: [], missing: ["Team Log, Owner Follow Up, and Active Issues could not be loaded right now."] };
  const coverageSignals = workload.departments
    .filter((entry) => entry.overdue > 0 || entry.urgent > 1)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      message:
        entry.overdue > 0
          ? `${entry.overdue} overdue ${entry.overdue === 1 ? "item" : "items"} in ${entry.label}. Check whether the shift needs another set of hands.`
          : `${entry.urgent} urgent items are open in ${entry.label}.`
    }));

  const directory = await ctx.directory();
  const visibleDevelopment = development.filter((row) => {
    const employee = directory.byId.get(row.employee_user_id);
    return employee ? canViewEmployee(ctx.actor, employee) : false;
  });
  const milestones = visibleDevelopment
    .filter((row) => ["milestone", "training", "goal"].includes(row.record_type) && row.due_on && row.due_on <= soon)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      employeeUserId: row.employee_user_id,
      employeeName: row.employee_name,
      type: row.record_type,
      typeLabel: DEVELOPMENT_RECORD_TYPE_LABELS[row.record_type],
      title: row.title,
      dueOn: row.due_on,
      status: row.status,
      overdue: Boolean(row.due_on && row.due_on < today)
    }));
  const developmentFollowUps = visibleDevelopment
    .filter((row) => row.record_type === "follow_up")
    .slice(0, 8)
    .map((row) => ({ id: row.id, employeeUserId: row.employee_user_id, employeeName: row.employee_name, title: row.title, dueOn: row.due_on }));
  const visibleFeedback: FeedbackRow[] = [];
  for (const row of feedback) {
    if (row.submitter_user_id === ctx.actor.userId) continue;
    const submitter = row.submitter_user_id ? directory.byId.get(row.submitter_user_id) : undefined;
    if (submitter ? canViewEmployee(ctx.actor, submitter) : ctx.actor.scope.all && tierRank(ctx.actor.tier) >= tierRank("admin")) {
      visibleFeedback.push(row);
    }
  }
  const scoped = scopeFilterDepartments(ctx.actor);
  const visibleAnnouncements = announcements.rows
    .filter((row) => !scoped || row.audience_departments.length === 0 || row.audience_departments.some((key) => scoped.includes(key)))
    .slice(0, 3)
    .map((row) => ({ id: row.id, title: row.title, publishedAt: row.published_at, author: row.created_by_name, audience: departmentsLabel(row.audience_departments) }));

  const result = {
    generatedAt: ctx.now().toISOString(),
    tier: ctx.actor.tier,
    scope: {
      all: ctx.actor.scope.all,
      label: scopeLabel(ctx.actor.scope),
      departments: departments.map((key) => ({ key, label: departmentLabel(key) }))
    },
    headcount: { total: team.length, byDepartment: headcount },
    recognition: {
      windowDays: RECENT_RECOGNITION_DAYS,
      published: recent.length,
      previousWindow: previous.length,
      crossDepartment: recent.filter(isCrossDepartment).length,
      participation: { authors: authors.size, recipients: recipients.size, team: team.length }
    },
    recentBarkOuts: await barkOutViews(ctx, recentRows.rows),
    recentlyRecognized: { total: recognized.length, people: recognized.slice(0, 12) },
    notRecentlyRecognized: { total: notRecognized.length, people: notRecognized.slice(0, 12) },
    workload,
    coverage: {
      measured: false,
      note: "Shift schedules aren't stored in RuffOps, so coverage is shown as signals from open work rather than staffing levels.",
      signals: coverageSignals
    },
    moderation: has(ctx, "engagement.moderate")
      ? {
          pending: pendingCount?.total ?? 0,
          awaitingAuthor: awaitingCount?.total ?? 0,
          reported: reportedCount?.total ?? 0,
          escalated: escalatedCount?.total ?? 0
        }
      : null,
    milestones,
    announcements: visibleAnnouncements,
    followUps: {
      development: developmentFollowUps,
      feedbackAwaitingResponse: visibleFeedback.filter((row) => row.status === "submitted").length,
      feedbackDue: visibleFeedback
        .filter((row) => row.follow_up_on && row.follow_up_on <= addDaysToDateKey(today, 7))
        .slice(0, 8)
        .map((row) => ({ id: row.id, subject: row.subject, followUpOn: row.follow_up_on, status: row.status }))
    },
    departments: null as null | Awaited<ReturnType<typeof departmentSummaries>>,
    access: null as null | Record<"super_admin" | "admin" | "management" | "staff", number>,
    system: null as null | { storageReady: boolean; aiConfigured: boolean; aiEnabled: boolean; featuresOff: string[] }
  };

  if (ctx.actor.scope.all && tierRank(ctx.actor.tier) >= tierRank("admin")) {
    result.departments = await departmentSummaries(ctx, { published: recent, team, feedback: visibleFeedback });
  }
  if (ctx.actor.tier === "super_admin") {
    const everyone = directory.employees.filter((employee) => employee.active);
    result.access = {
      super_admin: everyone.filter((employee) => employee.tier === "super_admin").length,
      admin: everyone.filter((employee) => employee.tier === "admin").length,
      management: everyone.filter((employee) => employee.tier === "management").length,
      staff: everyone.filter((employee) => !employee.tier).length
    };
    result.system = {
      storageReady: ctx.storageReady,
      aiConfigured: ctx.aiConfigured(),
      aiEnabled: settings.aiPolicy.enabled,
      featuresOff: FEATURE_KEYS.filter((key) => !settings.features[key])
    };
  }
  return result;
}

async function departmentSummaries(
  ctx: ServiceContext,
  input: { published: BarkOutStat[]; team: EngagementEmployee[]; feedback: FeedbackRow[] }
) {
  const { rows: managers } = await ctx.db.select<DepartmentManagerRow>("team_engagement_department_managers", { limit: 1000 });
  const directory = await ctx.directory();
  return ENGAGEMENT_DEPARTMENTS.map((key) => ({
    key,
    label: departmentLabel(key),
    headcount: input.team.filter((employee) => (employee.departments as string[]).includes(key)).length,
    managers: managers
      .filter((row) => row.department_key === key)
      .map((row) => directory.byId.get(row.manager_user_id)?.name ?? "Former manager"),
    barkOutsReceived: input.published.filter((row) => row.recipient_departments.includes(key)).length,
    barkOutsSent: input.published.filter((row) => row.author_departments.includes(key)).length,
    openFeedback: input.feedback.filter((row) => row.submitter_departments.includes(key)).length
  }));
}

// ---------------------------------------------------------------------------------------------
// Staff directory & profiles
// ---------------------------------------------------------------------------------------------

export async function staffDirectory(ctx: ServiceContext, input: { search?: unknown; department?: unknown; role?: unknown; status?: unknown }) {
  requireStorage(ctx);
  const department = departmentFilterValue(ctx, input.department);
  const status = input.status === "inactive" || input.status === "all" ? input.status : "active";
  const settings = await ctx.settings();
  const members = (await teamMembers(ctx, department, status !== "active")).filter((employee) =>
    status === "inactive" ? !employee.active : status === "active" ? employee.active : true
  );
  const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
  const role = typeof input.role === "string" && input.role ? input.role : null;
  const filtered = members.filter((employee) => {
    if (role && employee.legacyRole !== role) return false;
    if (!search) return true;
    return [employee.name, employee.title ?? "", employee.departmentLabel ?? ""].some((value) => value.toLowerCase().includes(search));
  });

  const [published, development] = await Promise.all([
    publishedSince(ctx, daysAgoIso(ctx, 365), department),
    has(ctx, "engagement.manage_team") && settings.features.development
      ? all<DevelopmentRecordRow>(ctx, "team_engagement_development_records", {
          columns: ["id", "employee_user_id", "record_type", "title", "status", "due_on"],
          filters: [{ column: "status", op: "in", value: ["planned", "in_progress"] }, ...overlapFilter("employee_departments", ctx, department)],
          order: [
            { column: "due_on", ascending: true },
            { column: "id", ascending: true }
          ]
        })
      : []
  ]);
  const lastRecognized = new Map<string, string>();
  for (const row of published) {
    if (!row.recipient_user_id || !row.published_at) continue;
    const current = lastRecognized.get(row.recipient_user_id);
    if (!current || row.published_at > current) lastRecognized.set(row.recipient_user_id, row.published_at);
  }
  const recentCutoff = daysAgoIso(ctx, RECENT_RECOGNITION_DAYS);
  const roles = [...new Set(members.map((employee) => employee.legacyRole))]
    .map((value) => ({ value, label: roleLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    scope: { all: ctx.actor.scope.all, label: scopeLabel(ctx.actor.scope) },
    departments: departmentsInView(ctx, null).map((key) => ({ key, label: departmentLabel(key) })),
    roles,
    total: filtered.length,
    items: filtered.map((employee) => {
      const open = development.filter((row) => row.employee_user_id === employee.userId);
      const next = open.find((row) => row.due_on && (row.record_type === "milestone" || row.record_type === "training" || row.record_type === "goal"));
      const last = lastRecognized.get(employee.userId) ?? null;
      return {
        ...personSummary(employee),
        lastRecognizedAt: last,
        recognizedRecently: Boolean(last && last >= recentCutoff),
        openDevelopment: open.length,
        nextMilestone: next ? { title: next.title, dueOn: next.due_on } : null
      };
    })
  };
}

export async function employeeProfile(ctx: ServiceContext, input: { userId?: unknown }) {
  requireStorage(ctx);
  const userId = requireUuid(input.userId, "team member");
  const directory = await ctx.directory();
  const employee = directory.byId.get(userId);
  if (!employee || !canViewEmployee(ctx.actor, employee)) throw notFoundError("That team member");
  const settings = await ctx.settings();

  const [received, sent, development, nominations, programs] = await Promise.all([
    ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
      filters: [
        { column: "recipient_user_id", op: "eq", value: userId },
        { column: "status", op: "eq", value: "published" }
      ],
      order: [
        { column: "published_at", ascending: false },
        { column: "id", ascending: false }
      ],
      limit: 25
    }),
    ctx.db.select<BarkOutRow>("team_engagement_bark_outs", {
      filters: [
        { column: "author_user_id", op: "eq", value: userId },
        { column: "status", op: "eq", value: "published" }
      ],
      order: [
        { column: "published_at", ascending: false },
        { column: "id", ascending: false }
      ],
      limit: 10
    }),
    has(ctx, "engagement.manage_team") && settings.features.development
      ? ctx.db.select<DevelopmentRecordRow>("team_engagement_development_records", {
          filters: [{ column: "employee_user_id", op: "eq", value: userId }],
          order: [{ column: "updated_at", ascending: false }],
          limit: 200
        })
      : { rows: [] as DevelopmentRecordRow[], total: null },
    ctx.db.select<NominationRow>("team_engagement_nominations", {
      filters: [{ column: "nominee_user_id", op: "eq", value: userId }],
      order: [{ column: "created_at", ascending: false }],
      limit: 50
    }),
    ctx.db.select<ProgramRow>("team_engagement_programs", { limit: 200 })
  ]);
  const programNames = new Map(programs.rows.map((program) => [program.id, program.name]));
  const records = development.rows.map((row) => ({
    id: row.id,
    recordType: row.record_type,
    typeLabel: DEVELOPMENT_RECORD_TYPE_LABELS[row.record_type],
    title: row.title,
    details: row.details,
    status: row.status,
    visibility: row.visibility,
    dueOn: row.due_on,
    completedAt: row.completed_at,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at
  }));
  const byType = (types: string[]) => records.filter((record) => types.includes(record.recordType));
  return {
    employee: personSummary(employee),
    recognition: {
      lastRecognizedAt: received.rows[0]?.published_at ?? null,
      received: await barkOutViews(ctx, received.rows),
      sent: await barkOutViews(ctx, sent.rows)
    },
    development: {
      available: has(ctx, "engagement.manage_team") && settings.features.development,
      skills: byType(["skill"]),
      milestones: byType(["milestone", "training"]),
      goals: byType(["goal"]),
      achievements: byType(["achievement"]),
      growthNotes: byType(["growth_note"]),
      followUps: byType(["follow_up"])
    },
    nominations: nominations.rows.map((row) => ({
      id: row.id,
      programName: programNames.get(row.program_id) ?? "Recognition program",
      periodLabel: row.period_label,
      status: row.status,
      statusLabel: NOMINATION_STATUS_LABELS[row.status],
      decidedAt: row.decided_at
    })),
    canManageDevelopment: has(ctx, "engagement.manage_team") && settings.features.development && employee.active,
    canNominate: has(ctx, "engagement.manage_team") && settings.features.programs && employee.active
  };
}

export async function employeeAvatar(ctx: ServiceContext, input: { userId?: unknown }) {
  const userId = requireUuid(input.userId, "team member");
  const employee = (await ctx.directory()).byId.get(userId);
  if (!employee || !canViewEmployee(ctx.actor, employee)) throw notFoundError("That team member");
  return { userId, avatarUrl: await ctx.loadAvatar(userId) };
}

/** Pickers for nominations, development records, and department managers. */
export async function employeeOptions(ctx: ServiceContext, input: { tier?: unknown }) {
  const directory = await ctx.directory();
  if (input.tier === "management") {
    if (!has(ctx, "engagement.manage_departments")) throw forbiddenError();
    return {
      items: directory.employees
        .filter((employee) => employee.active && employee.tier === "management" && employee.userId !== ctx.actor.userId)
        .map((employee) => ({ userId: employee.userId, name: employee.name, title: employee.title, departments: employee.departments }))
    };
  }
  return {
    items: (await teamMembers(ctx, null)).map((employee) => ({
      userId: employee.userId,
      name: employee.name,
      title: employee.title,
      departments: employee.departments
    }))
  };
}

// ---------------------------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------------------------

function bucketKey(dateKey: string, weekly: boolean) {
  if (!weekly) return dateKey;
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  return addDaysToDateKey(dateKey, -weekday);
}

function buckets(range: DateRange, weekly: boolean) {
  const keys: string[] = [];
  let cursor = bucketKey(range.from, weekly);
  while (cursor <= range.to) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, weekly ? 7 : 1);
  }
  return keys;
}

function inRange(iso: string | null, range: DateRange) {
  const key = pacificDateKey(iso);
  return Boolean(key && key >= range.from && key <= range.to);
}

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export async function analytics(ctx: ServiceContext, input: { from?: unknown; to?: unknown; department?: unknown }) {
  requireStorage(ctx);
  const range = parseRange(ctx, input);
  const department = departmentFilterValue(ctx, input.department);
  const weekly = range.days > 45;
  const [settings, team, operations] = await Promise.all([ctx.settings(), teamMembers(ctx, department), ctx.operations().catch(() => null)]);

  const [created, development, feedback] = await Promise.all([
    all<BarkOutStat>(ctx, "team_engagement_bark_outs", {
      columns: BARK_OUT_STAT_COLUMNS,
      filters: [
        { column: "created_at", op: "gte", value: range.startIso },
        { column: "created_at", op: "lt", value: range.endIso },
        ...barkOutScopeFilters(ctx, department)
      ],
      order: [
        { column: "created_at", ascending: true },
        { column: "id", ascending: true }
      ]
    }),
    all<DevelopmentRecordRow>(ctx, "team_engagement_development_records", {
      columns: ["id", "employee_user_id", "record_type", "status", "completed_at", "created_at", "employee_departments"],
      filters: [
        { column: "completed_at", op: "gte", value: range.startIso },
        { column: "completed_at", op: "lt", value: range.endIso },
        ...overlapFilter("employee_departments", ctx, department)
      ],
      order: [
        { column: "completed_at", ascending: true },
        { column: "id", ascending: true }
      ]
    }),
    all<FeedbackRow>(ctx, "team_engagement_feedback", {
      columns: ["id", "category", "status", "created_at", "submitter_departments", "about_department"],
      filters: [
        { column: "created_at", op: "gte", value: range.startIso },
        { column: "created_at", op: "lt", value: range.endIso },
        ...overlapFilter("submitter_departments", ctx, department)
      ],
      order: [
        { column: "created_at", ascending: true },
        { column: "id", ascending: true }
      ]
    })
  ]);

  const ids = created.map((row) => row.id);
  const reports = ids.length
    ? (
        await all<ConcernReportRow>(ctx, "team_engagement_reports", {
          columns: ["id", "bark_out_id", "status", "created_at"],
          filters: [
            { column: "created_at", op: "gte", value: range.startIso },
            { column: "created_at", op: "lt", value: range.endIso }
          ],
          order: [
            { column: "created_at", ascending: true },
            { column: "id", ascending: true }
          ]
        })
      ).filter((row) => ids.includes(row.bark_out_id))
    : [];

  const published = created.filter((row) => row.status === "published");
  const keys = buckets(range, weekly);
  const overTime = keys.map((key) => ({ bucket: key, published: 0, crossDepartment: 0 }));
  const index = new Map(keys.map((key, position) => [key, position]));
  for (const row of published) {
    const dateKey = pacificDateKey(row.created_at);
    if (!dateKey) continue;
    const slot = index.get(bucketKey(dateKey, weekly));
    if (slot === undefined) continue;
    overTime[slot]!.published += 1;
    if (isCrossDepartment(row)) overTime[slot]!.crossDepartment += 1;
  }

  const categoryLabels = new Map(settings.categories.map((category) => [category.key, category.label]));
  const byCategory = [...countBy(published, (row) => row.category)]
    .map(([key, count]) => ({ key, label: categoryLabels.get(key) ?? key.replace(/_/g, " "), count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const departments = departmentsInView(ctx, department);
  const byDepartment = departments.map((key) => ({
    key,
    label: departmentLabel(key),
    received: published.filter((row) => row.recipient_departments.includes(key)).length,
    sent: published.filter((row) => row.author_departments.includes(key)).length
  }));

  const collaboration = new Map<string, number>();
  for (const row of published.filter(isCrossDepartment)) {
    const pairs = new Set<string>();
    for (const from of row.author_departments) {
      for (const to of row.recipient_departments) {
        if (from !== to) pairs.add(`${from}→${to}`);
      }
    }
    for (const pair of pairs) collaboration.set(pair, (collaboration.get(pair) ?? 0) + 1);
  }

  const teamIds = new Set(team.map((employee) => employee.userId));
  const authors = new Set(published.map((row) => row.author_user_id).filter((id): id is string => Boolean(id && teamIds.has(id))));
  const recipients = new Set(published.map((row) => row.recipient_user_id).filter((id): id is string => Boolean(id && teamIds.has(id))));

  const statusCounts = countBy(created, (row) => row.status);
  const outcomeCounts = countBy(created, (row) => row.moderation_outcome);
  const workItems = operations?.items.filter((item) => item.department && departments.includes(item.department)) ?? [];

  return {
    range: { from: range.from, to: range.to, days: range.days, bucket: weekly ? "week" : "day" },
    department: department ? { key: department, label: departmentLabel(department) } : null,
    scope: { all: ctx.actor.scope.all, label: scopeLabel(ctx.actor.scope) },
    departments: departmentsInView(ctx, null).map((key) => ({ key, label: departmentLabel(key) })),
    totals: {
      published: published.length,
      crossDepartment: published.filter(isCrossDepartment).length,
      submitted: created.length,
      reportsFiled: reports.length,
      milestonesCompleted: development.filter((row) => row.record_type === "milestone" || row.record_type === "training").length,
      feedbackSubmitted: feedback.length
    },
    participation: { authors: authors.size, recipients: recipients.size, team: team.length },
    overTime,
    byCategory,
    byDepartment,
    collaboration: [...collaboration]
      .map(([pair, count]) => {
        const [from, to] = pair.split("→") as [string, string];
        return { from, fromLabel: departmentLabel(from), to, toLabel: departmentLabel(to), count };
      })
      .sort((a, b) => a.fromLabel.localeCompare(b.fromLabel) || a.toLabel.localeCompare(b.toLabel)),
    moderation: {
      byStatus: BARK_OUT_STATUSES.map((status) => ({ status, label: BARK_OUT_STATUS_LABELS[status], count: statusCounts.get(status) ?? 0 })),
      byOutcome: MODERATION_OUTCOMES.map((outcome) => ({ outcome, count: outcomeCounts.get(outcome) ?? 0 })).filter((entry) => entry.count > 0),
      reportsFiled: reports.length,
      reportsOpen: reports.filter((row) => row.status === "open").length
    },
    development: DEVELOPMENT_RECORD_TYPES.map((type) => ({
      type,
      label: DEVELOPMENT_RECORD_TYPE_LABELS[type],
      completed: development.filter((row) => row.record_type === type).length
    })).filter((entry) => entry.completed > 0),
    feedback: {
      byCategory: FEEDBACK_CATEGORIES.map((category) => ({
        key: category,
        label: FEEDBACK_CATEGORY_LABELS[category],
        count: feedback.filter((row) => row.category === category).length
      })).filter((entry) => entry.count > 0),
      byStatus: FEEDBACK_STATUSES.map((status) => ({
        key: status,
        label: FEEDBACK_STATUS_LABELS[status],
        count: feedback.filter((row) => row.status === status).length
      })).filter((entry) => entry.count > 0)
    },
    workload: operations
      ? {
          available: true,
          departments: departments.map((key) => ({
            key,
            label: departmentLabel(key),
            created: workItems.filter((item) => item.department === key && inRange(item.createdAt, range)).length,
            closed: workItems.filter((item) => item.department === key && inRange(item.closedAt, range)).length
          }))
        }
      : { available: false, departments: [] },
    missing: [
      ...(operations?.missing ?? ["Team Log, Owner Follow Up, and Active Issues could not be loaded right now."]),
      "Bark Out counts show recognition activity. They are not a measure of anyone's performance."
    ]
  };
}

// ---------------------------------------------------------------------------------------------
// Workload intelligence
// ---------------------------------------------------------------------------------------------

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function workload(ctx: ServiceContext, input: { from?: unknown; to?: unknown; department?: unknown }) {
  const range = parseRange(ctx, input, 30);
  const department = departmentFilterValue(ctx, input.department);
  const departments = departmentsInView(ctx, department);
  const operations = await ctx.operations().catch(() => null);
  if (!operations) {
    return {
      available: false,
      range: { from: range.from, to: range.to },
      departments: departmentsInView(ctx, null).map((key) => ({ key, label: departmentLabel(key) })),
      summary: [],
      people: [],
      recommendations: [],
      note: WORKLOAD_NOTE,
      missing: ["Team Log, Owner Follow Up, and Active Issues could not be loaded right now. Try again in a minute."]
    };
  }

  const team = await teamMembers(ctx, department);
  const byName = new Map<string, EngagementEmployee>();
  for (const employee of team) byName.set(normalizeName(employee.name), employee);
  const departmentItems = operations.items.filter((item) => item.department && departments.includes(item.department));
  const openPersonal = operations.items.filter((item) => item.open && item.assigneeName && byName.has(normalizeName(item.assigneeName)));
  const unmatched = departmentItems.filter((item) => item.open && item.assigneeName && !byName.has(normalizeName(item.assigneeName))).length;

  const summary = departments.map((key) => {
    const items = departmentItems.filter((item) => item.department === key);
    const open = items.filter((item) => item.open);
    const now = ctx.now().getTime();
    const ages = open.map((item) => (now - Date.parse(item.createdAt)) / 86_400_000).filter((value) => Number.isFinite(value) && value >= 0);
    return {
      key,
      label: departmentLabel(key),
      open: open.length,
      urgent: open.filter((item) => item.urgent).length,
      overdue: open.filter((item) => item.overdue).length,
      unassigned: open.filter((item) => !item.assigneeName).length,
      created: items.filter((item) => inRange(item.createdAt, range)).length,
      closed: items.filter((item) => inRange(item.closedAt, range)).length,
      medianOpenAgeDays: ages.length ? Math.round(median(ages) * 10) / 10 : null,
      headcount: team.filter((employee) => (employee.departments as string[]).includes(key)).length
    };
  });

  const people = team
    .map((employee) => {
      const items = openPersonal.filter((item) => normalizeName(item.assigneeName!) === normalizeName(employee.name));
      return {
        userId: employee.userId,
        name: employee.name,
        title: employee.title,
        open: items.length,
        overdue: items.filter((item) => item.overdue).length,
        urgent: items.filter((item) => item.urgent).length
      };
    })
    .filter((person) => person.open > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const recommendations: { id: string; severity: "info" | "attention"; message: string; department: string | null }[] = [];
  for (const entry of summary) {
    if (entry.overdue >= 3) {
      recommendations.push({
        id: `overdue:${entry.key}`,
        severity: "attention",
        department: entry.key,
        message: `${entry.label} has ${entry.overdue} overdue items. Review due dates or share the follow-ups across the shift.`
      });
    }
    if (entry.unassigned >= 3) {
      recommendations.push({
        id: `unassigned:${entry.key}`,
        severity: "attention",
        department: entry.key,
        message: `${entry.unassigned} open ${entry.label} items have no owner. Assign owners so nothing slips.`
      });
    }
    if (entry.created - entry.closed >= 5) {
      recommendations.push({
        id: `backlog:${entry.key}`,
        severity: "info",
        department: entry.key,
        message: `${entry.label} opened ${entry.created - entry.closed} more items than it closed in this range. Check whether the team needs support.`
      });
    }
    if (entry.headcount > 0 && entry.open / entry.headcount >= 4) {
      recommendations.push({
        id: `per-person:${entry.key}`,
        severity: "info",
        department: entry.key,
        message: `${entry.label} averages ${Math.round((entry.open / entry.headcount) * 10) / 10} open items per team member.`
      });
    }
  }
  const typical = median(people.map((person) => person.open));
  for (const person of people) {
    if (person.open >= 5 && person.open >= typical * 2) {
      recommendations.push({
        id: `support:${person.userId}`,
        severity: "info",
        department: null,
        message: `Offer support to ${person.name}: ${person.open} open assignments while the team typically carries ${typical}.`
      });
    }
  }

  return {
    available: true,
    range: { from: range.from, to: range.to },
    departments: departmentsInView(ctx, null).map((key) => ({ key, label: departmentLabel(key) })),
    summary,
    people,
    recommendations,
    note: WORKLOAD_NOTE,
    missing: [
      ...operations.missing,
      ...(unmatched ? [`${unmatched} open ${unmatched === 1 ? "item names" : "items name"} someone who isn't on this team list.`] : []),
      "Active Issues don't record a department, so they appear only in the per-person view."
    ]
  };
}

// ---------------------------------------------------------------------------------------------
// Reports & exports
// ---------------------------------------------------------------------------------------------

export const EXPORT_TYPES = {
  bark_outs: {
    label: "Bark Outs",
    description: "Posted Bark Outs with author, recipient, category, and message.",
    requires: ["engagement.export"] as EngagementPermission[]
  },
  analytics_summary: {
    label: "Engagement summary",
    description: "Recognition totals by category, department, and cross-department pairs.",
    requires: ["engagement.export", "engagement.view_analytics"] as EngagementPermission[]
  },
  moderation: {
    label: "Moderation decisions",
    description: "Moderation status and outcomes. Message text is left out.",
    requires: ["engagement.export", "engagement.moderate"] as EngagementPermission[]
  },
  feedback: {
    label: "Feedback & suggestions",
    description: "Suggestion subjects, categories, and status.",
    requires: ["engagement.export", "engagement.manage_team"] as EngagementPermission[]
  },
  development: {
    label: "Development milestones",
    description: "Development record titles, types, status, and dates. Private notes are left out.",
    requires: ["engagement.export", "engagement.manage_team"] as EngagementPermission[]
  },
  audit: {
    label: "Audit history",
    description: "Who changed what, and when.",
    requires: ["engagement.export", "engagement.view_audit_logs"] as EngagementPermission[]
  }
} as const;
export type ExportType = keyof typeof EXPORT_TYPES;

export function isExportType(value: unknown): value is ExportType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXPORT_TYPES, value);
}

export function canExport(permissions: readonly EngagementPermission[], type: ExportType) {
  return EXPORT_TYPES[type].requires.every((permission) => permissions.includes(permission));
}

export function reportsCatalog(ctx: ServiceContext) {
  return {
    scope: { all: ctx.actor.scope.all, label: scopeLabel(ctx.actor.scope) },
    departments: departmentsInView(ctx, null).map((key) => ({ key, label: departmentLabel(key) })),
    exports: (Object.keys(EXPORT_TYPES) as ExportType[]).map((key) => ({
      key,
      label: EXPORT_TYPES[key].label,
      description: EXPORT_TYPES[key].description,
      allowed: canExport(ctx.actor.permissions, key)
    }))
  };
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function pacificStamp(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "short" });
}

export async function buildExport(ctx: ServiceContext, input: { type?: unknown; from?: unknown; to?: unknown; department?: unknown }) {
  requireStorage(ctx);
  if (!isExportType(input.type)) throw validationError("Choose a report to export.");
  const type = input.type;
  if (!canExport(ctx.actor.permissions, type)) throw forbiddenError();
  const range = parseRange(ctx, input);
  const department = departmentFilterValue(ctx, input.department);
  const settings = await ctx.settings();
  const labels = new Map(settings.categories.map((category) => [category.key, category.label]));
  const createdRange: DbFilter[] = [
    { column: "created_at", op: "gte", value: range.startIso },
    { column: "created_at", op: "lt", value: range.endIso }
  ];

  let header: string[] = [];
  let rows: unknown[][] = [];
  if (type === "bark_outs") {
    const data = await all<BarkOutRow>(ctx, "team_engagement_bark_outs", {
      filters: [
        { column: "status", op: "eq", value: "published" },
        { column: "published_at", op: "gte", value: range.startIso },
        { column: "published_at", op: "lt", value: range.endIso },
        ...barkOutScopeFilters(ctx, department)
      ],
      order: [
        { column: "published_at", ascending: true },
        { column: "id", ascending: true }
      ]
    });
    header = ["Posted (Pacific)", "From", "To", "To departments", "Category", "Message", "Context"];
    rows = data.map((row) => [
      pacificStamp(row.published_at),
      row.author_name,
      row.recipient_name,
      row.recipient_departments.map((key) => departmentLabel(key)),
      labels.get(row.category) ?? row.category,
      row.message,
      row.context
    ]);
  } else if (type === "moderation") {
    const data = await all<BarkOutStat>(ctx, "team_engagement_bark_outs", {
      columns: BARK_OUT_STAT_COLUMNS,
      filters: [...createdRange, ...barkOutScopeFilters(ctx, department)],
      order: [
        { column: "created_at", ascending: true },
        { column: "id", ascending: true }
      ]
    });
    header = ["Submitted (Pacific)", "From", "To", "Category", "Status", "Outcome", "Escalated", "Open reports", "Decided by", "Decided (Pacific)"];
    rows = data.map((row) => [
      pacificStamp(row.created_at),
      row.author_name,
      row.recipient_name,
      labels.get(row.category) ?? row.category,
      BARK_OUT_STATUS_LABELS[row.status as BarkOutStatus] ?? row.status,
      row.moderation_outcome.replace(/_/g, " "),
      row.escalated_at ? "Yes" : "No",
      row.open_report_count,
      row.decided_by_name,
      pacificStamp(row.decided_at)
    ]);
  } else if (type === "analytics_summary") {
    const data = await analytics(ctx, input);
    header = ["Section", "Item", "Count"];
    rows = [
      ["Totals", "Bark Outs posted", data.totals.published],
      ["Totals", "Cross-department Bark Outs", data.totals.crossDepartment],
      ["Totals", "Bark Outs submitted", data.totals.submitted],
      ["Totals", "Concern reports filed", data.totals.reportsFiled],
      ["Totals", "Milestones and training completed", data.totals.milestonesCompleted],
      ["Totals", "Suggestions submitted", data.totals.feedbackSubmitted],
      ["Participation", "Team members who sent a Bark Out", data.participation.authors],
      ["Participation", "Team members recognized", data.participation.recipients],
      ["Participation", "Team members in view", data.participation.team],
      ...data.byCategory.map((entry) => ["Category", entry.label, entry.count]),
      ...data.byDepartment.map((entry) => ["Department received", entry.label, entry.received]),
      ...data.byDepartment.map((entry) => ["Department sent", entry.label, entry.sent]),
      ...data.collaboration.map((entry) => ["Cross-department", `${entry.fromLabel} → ${entry.toLabel}`, entry.count])
    ];
  } else if (type === "feedback") {
    if (!settings.features.feedback) throw new EngagementError(403, "feature_disabled", "Feedback is turned off right now.");
    const directory = await ctx.directory();
    const data = (
      await all<FeedbackRow>(ctx, "team_engagement_feedback", {
        filters: [...createdRange, ...overlapFilter("submitter_departments", ctx, department)],
        order: [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true }
        ]
      })
    ).filter((row) => {
      if (row.submitter_user_id === ctx.actor.userId) return false;
      const submitter = row.submitter_user_id ? directory.byId.get(row.submitter_user_id) : undefined;
      return submitter ? canViewEmployee(ctx.actor, submitter) : ctx.actor.scope.all && tierRank(ctx.actor.tier) >= tierRank("admin");
    });
    header = ["Submitted (Pacific)", "Submitted by", "Category", "About", "Subject", "Status", "Resolved (Pacific)"];
    rows = data.map((row) => [
      pacificStamp(row.created_at),
      row.submitter_name,
      FEEDBACK_CATEGORY_LABELS[row.category],
      row.about_department ? departmentLabel(row.about_department) : "",
      row.subject,
      FEEDBACK_STATUS_LABELS[row.status],
      pacificStamp(row.resolved_at)
    ]);
  } else if (type === "development") {
    if (!settings.features.development) throw new EngagementError(403, "feature_disabled", "Employee development is turned off right now.");
    const directory = await ctx.directory();
    const data = (
      await all<DevelopmentRecordRow>(ctx, "team_engagement_development_records", {
        filters: [
          { column: "updated_at", op: "gte", value: range.startIso },
          { column: "updated_at", op: "lt", value: range.endIso },
          ...overlapFilter("employee_departments", ctx, department)
        ],
        order: [
          { column: "updated_at", ascending: true },
          { column: "id", ascending: true }
        ]
      })
    ).filter((row) => {
      const employee = directory.byId.get(row.employee_user_id);
      return employee ? canViewEmployee(ctx.actor, employee) : false;
    });
    header = ["Team member", "Type", "Title", "Status", "Due", "Completed (Pacific)", "Shared with team member"];
    rows = data.map((row) => [
      row.employee_name,
      DEVELOPMENT_RECORD_TYPE_LABELS[row.record_type],
      row.title,
      row.status.replace(/_/g, " "),
      row.due_on,
      pacificStamp(row.completed_at),
      row.visibility === "shared_with_employee" ? "Yes" : "No"
    ]);
  } else if (type === "audit") {
    const data = await all<AuditEventRow>(ctx, "team_engagement_audit_events", {
      filters: [
        { column: "occurred_at", op: "gte", value: range.startIso },
        { column: "occurred_at", op: "lt", value: range.endIso }
      ],
      order: [
        { column: "occurred_at", ascending: true },
        { column: "id", ascending: true }
      ]
    });
    header = ["When (Pacific)", "Actor", "Actor role", "Category", "Action", "Target", "Scope", "Reason"];
    rows = data.map((row) => [
      pacificStamp(row.occurred_at),
      row.actor_name,
      row.actor_role,
      row.category,
      row.action,
      row.target_label,
      row.scope,
      row.reason
    ]);
  }

  const filename = `ruffops-${type.replace(/_/g, "-")}-${range.from}-to-${range.to}.csv`;
  await ctx.db.commit([
    auditOp(ctx, {
      category: "export",
      action: `export.${type}`,
      targetType: "export",
      targetId: type,
      targetLabel: EXPORT_TYPES[type].label,
      scope: department ? departmentLabel(department) : scopeLabel(ctx.actor.scope),
      next: { rows: rows.length, from: range.from, to: range.to }
    })
  ]);
  return { filename, csv: toCsv(header, rows), rowCount: rows.length };
}

// ---------------------------------------------------------------------------------------------
// Audit history
// ---------------------------------------------------------------------------------------------

const AUDIT_PAGE_SIZE = 50;

export async function auditHistory(ctx: ServiceContext, input: { category?: unknown; from?: unknown; to?: unknown; offset?: unknown; search?: unknown }) {
  requireStorage(ctx);
  const range = parseRange(ctx, input, 30);
  const filters: DbFilter[] = [
    { column: "occurred_at", op: "gte", value: range.startIso },
    { column: "occurred_at", op: "lt", value: range.endIso }
  ];
  if (typeof input.category === "string" && input.category && input.category !== "all") {
    filters.push({ column: "category", op: "eq", value: input.category });
  }
  if (typeof input.search === "string" && input.search.trim()) {
    const term = `%${input.search.trim().slice(0, 60).replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
    filters.push({
      op: "or",
      filters: [
        { column: "actor_name", op: "ilike", value: term },
        { column: "action", op: "ilike", value: term },
        { column: "target_label", op: "ilike", value: term }
      ]
    });
  }
  const offsetValue = Number(input.offset);
  const offset = Number.isFinite(offsetValue) && offsetValue > 0 ? Math.floor(offsetValue) : 0;
  const { rows, total } = await ctx.db.select<AuditEventRow>("team_engagement_audit_events", {
    filters,
    order: [
      { column: "occurred_at", ascending: false },
      { column: "id", ascending: false }
    ],
    limit: AUDIT_PAGE_SIZE,
    offset,
    count: true
  });
  return {
    range: { from: range.from, to: range.to },
    items: rows.map((row) => ({
      id: row.id,
      at: row.occurred_at,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      category: row.category,
      action: row.action,
      targetType: row.target_type,
      targetLabel: row.target_label,
      scope: row.scope,
      previous: row.previous_value,
      next: row.new_value,
      reason: row.reason
    })),
    total: total ?? rows.length,
    offset,
    pageSize: AUDIT_PAGE_SIZE
  };
}

