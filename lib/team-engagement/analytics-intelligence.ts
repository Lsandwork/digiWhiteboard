import type { DepartmentKey } from "@/lib/admin/permissions";
import { ADMIN_USER_ROLE_LABELS, type AdminUserRole } from "@/lib/admin/users";
import {
  BARK_OUT_STATUS_LABELS,
  ENGAGEMENT_DEPARTMENTS,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  departmentLabel,
  isEngagementDepartment,
  type BarkOutStatus,
  type FeedbackCategory,
  type FeedbackStatus
} from "@/lib/team-engagement/constants";
import {
  addDaysToDateKey,
  canViewEmployee,
  isoDate,
  pacificDateRange,
  requireStorage,
  requireUuid,
  scopeFilterDepartments,
  scopeLabel,
  type ServiceContext
} from "@/lib/team-engagement/context";
import { selectAll } from "@/lib/team-engagement/db";
import { EngagementError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import type { BarkOutRow, DbFilter, EngagementEmployee, EngagementTable, FeedbackEventRow, FeedbackRow } from "@/lib/team-engagement/types";
import { pacificDateKey, pacificTodayKey } from "@/lib/user-interactions/pacific";

const RESPONSE_CAP = 8000;
const PAGE_SIZE = 25;
const UNREVIEWED = new Set(["submitted", "under_review", "needs_information"]);

export const ENGAGEMENT_SCORE_FORMULA =
  "Share of active team members you are allowed to view who participated during the selected dates. Participation means a Team Pulse check-in, an identified survey answer, a Fun Zone answer, a suggestion, or a Bark Out they posted. Your own record is excluded by the existing privacy rule. Anonymous surveys are never attached to a name. This is participation, not a job-performance score.";

export const TEAM_RATING_FORMULA =
  "Average of the Team Pulse numbers teammates stored for workload, support, and connection. Each value is the 1–5 rating they entered. The product does not store which end of that scale is favorable, so this is not a sentiment score. The figure is omitted when nobody submitted Team Pulse in the range.";

export const RESPONSE_COUNT_FORMULA =
  "Identified answers you can open: each Team Pulse rating, each Team Pulse note, each identified Employee Voice answer, each Fun Zone answer, and each suggestion. Anonymous survey answers are not included in this count.";

const TABS = ["overview", "responses", "bark_outs", "trends", "team", "reports", "profile"] as const;
type Tab = (typeof TABS)[number];
const SOURCES = ["pulse", "voice", "fun", "feedback"] as const;
type Source = (typeof SOURCES)[number];
const QUESTION_TYPES = ["pulse_rating", "pulse_note", "voice_text", "voice_rating", "voice_yes_no", "voice_choice", "fun", "feedback"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

export const REPORT_TEMPLATES = [
  {
    id: "organization_engagement",
    label: "Organization Engagement Summary",
    description: "Participation, response totals, categories, and calculated insights for the dates in view.",
    sections: ["about", "totals", "categories", "departments", "insights"]
  },
  {
    id: "department_engagement",
    label: "Department Engagement Report",
    description: "Participation and recognition totals for each department you can view.",
    sections: ["about", "totals", "departments", "staff"]
  },
  {
    id: "employee_engagement",
    label: "Individual Employee Engagement Report",
    description: "One teammate's answers, Bark Outs given, and Bark Outs received. Choose a team member first.",
    sections: ["about", "employee", "responses", "recognition"]
  },
  {
    id: "staff_answers",
    label: "Staff Question & Answer Report",
    description: "Original identified answers for the current filters, without rewriting the text.",
    sections: ["about", "responses"]
  },
  {
    id: "bark_out_recognition",
    label: "Bark Out Recognition Report",
    description: "Posted Bark Outs with the sender and recipient kept distinct.",
    sections: ["about", "recognition", "leaderboard"]
  },
  {
    id: "participation_report",
    label: "Participation Report",
    description: "Who participated, pulse-week participation, and department rates.",
    sections: ["about", "totals", "staff", "departments"]
  },
  {
    id: "monthly_management",
    label: "Monthly Management Report",
    description: "A single packet of totals, insights, answers, and recognition for a management meeting.",
    sections: ["about", "totals", "insights", "categories", "departments", "staff", "responses", "recognition"]
  }
] as const;

export type ReportTemplateId = (typeof REPORT_TEMPLATES)[number]["id"];

export type ResponseItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  question: string;
  questionKey: string;
  answer: string;
  categoryKey: string;
  categoryLabel: string;
  questionType: QuestionType;
  source: Source;
  sourceLabel: string;
  status: string;
  statusKey: string;
  submittedAt: string;
  managementNotes: string[];
  resolution: string | null;
  notesLimited: boolean;
};

export type BarkItem = {
  id: string;
  givenBy: string;
  givenById: string | null;
  givenByViewable: boolean;
  receivedBy: string;
  receivedById: string | null;
  receivedByViewable: boolean;
  message: string;
  context: string | null;
  categoryKey: string;
  categoryLabel: string;
  status: string;
  statusLabel: string;
  submittedAt: string;
  publishedAt: string | null;
  senderDepartment: string;
  recipientDepartment: string;
};

export type StaffItem = {
  userId: string;
  name: string;
  title: string | null;
  department: string;
  engagementScore: number | null;
  responses: number;
  barkOutsGiven: number;
  barkOutsReceived: number;
  participated: boolean;
  pulseParticipation: number | null;
  trend: "up" | "down" | "flat" | "none";
};

export type InsightItem = {
  id: string;
  tone: "positive" | "attention" | "info";
  title: string;
  detail: string;
  formula: string;
};

type Range = { from: string; to: string; days: number; startIso: string; endIso: string };

type BuiltResponse = ResponseItem & { period: "current" | "prior" };
type BuiltBark = BarkItem & { period: "current" | "prior"; authorDepartments: string[]; recipientDepartments: string[] };

type PulseRow = {
  id: string;
  responder_user_id: string;
  week_start: string;
  workload_rating: number;
  support_rating: number;
  connection_rating: number;
  note: string | null;
  created_at: string;
};

type VoiceAnswerRow = {
  id: string;
  survey_id: string;
  question_id: string;
  responder_user_id: string;
  responder_name: string;
  answer: unknown;
  created_at: string;
};

function parseRange(ctx: ServiceContext, input: { from?: unknown; to?: unknown }, defaultDays = 30): Range {
  const today = pacificTodayKey(ctx.now());
  const to = isoDate(input.to, "end date") ?? today;
  const from = isoDate(input.from, "start date") ?? addDaysToDateKey(to, -(defaultDays - 1));
  if (from > to) throw validationError("The start date must be on or before the end date.");
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw validationError("Choose a range of one year or less.");
  return { from, to, days, ...pacificDateRange(from, to) };
}

function priorRange(range: Range): Range {
  const to = addDaysToDateKey(range.from, -1);
  const from = addDaysToDateKey(to, -(range.days - 1));
  return { from, to, days: range.days, ...pacificDateRange(from, to) };
}

function departmentFilter(ctx: ServiceContext, value: unknown) {
  if (value === undefined || value === null || value === "" || value === "all") return null;
  if (!isEngagementDepartment(value)) throw validationError("Choose a valid department.");
  const scoped = scopeFilterDepartments(ctx.actor);
  if (scoped && !scoped.includes(value)) throw forbiddenError();
  return value;
}

function periodOf(iso: string | null, range: Range, prior: Range): "current" | "prior" | null {
  const key = pacificDateKey(iso);
  if (!key) return null;
  if (key >= range.from && key <= range.to) return "current";
  if (key >= prior.from && key <= prior.to) return "prior";
  return null;
}

function bucketKey(dateKey: string, weekly: boolean) {
  if (!weekly) return dateKey;
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  return addDaysToDateKey(dateKey, -weekday);
}

function bucketKeys(range: Range, weekly: boolean) {
  const keys: string[] = [];
  let cursor = bucketKey(range.from, weekly);
  while (cursor <= range.to) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, weekly ? 7 : 1);
  }
  return keys;
}

function weekKeys(range: Range) {
  return bucketKeys(range, true);
}

function mean(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function percent(part: number, whole: number) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

function exactAnswer(answer: unknown): string {
  if (typeof answer === "string") return answer;
  if (typeof answer === "number" || typeof answer === "boolean") return String(answer);
  if (answer == null) return "";
  if (Array.isArray(answer)) return answer.map((item) => exactAnswer(item)).join(", ");
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

function roleLabel(legacyRole: string) {
  return ADMIN_USER_ROLE_LABELS[legacyRole as AdminUserRole] ?? legacyRole.replace(/_/g, " ");
}

function departmentText(employee: Pick<EngagementEmployee, "departmentLabel" | "departments">) {
  if (employee.departmentLabel) return employee.departmentLabel;
  if (!employee.departments.length) return "No department";
  return employee.departments.map((key) => departmentLabel(key)).join(", ");
}

function countDelta(current: number, prior: number) {
  if (prior === 0 && current === 0) return { direction: "flat" as const, label: "No change vs prior period" };
  if (prior === 0) return { direction: "up" as const, label: "None in the prior period" };
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return { direction: "flat" as const, label: "0% vs prior period" };
  return { direction: pct > 0 ? ("up" as const) : ("down" as const), label: `${pct > 0 ? "+" : ""}${pct}% vs prior period` };
}

function pointDelta(current: number | null, prior: number | null, suffix: string) {
  if (current == null || prior == null) return { direction: "flat" as const, label: "No prior period to compare" };
  const diff = Math.round((current - prior) * 10) / 10;
  if (diff === 0) return { direction: "flat" as const, label: `0 ${suffix}` };
  return {
    direction: diff > 0 ? ("up" as const) : ("down" as const),
    label: `${diff > 0 ? "+" : ""}${diff} ${suffix}`
  };
}

function pageOf<T>(rows: T[], page: number) {
  const start = (page - 1) * PAGE_SIZE;
  return { page, pageSize: PAGE_SIZE, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), items: rows.slice(start, start + PAGE_SIZE) };
}

function voiceQuestionType(value: string): QuestionType {
  if (value === "text") return "voice_text";
  if (value === "rating") return "voice_rating";
  if (value === "yes_no") return "voice_yes_no";
  return "voice_choice";
}

function haystack(row: ResponseItem) {
  return `${row.employeeName}\n${row.question}\n${row.answer}`.toLowerCase();
}

async function readOptional<T>(
  ctx: ServiceContext,
  table: EngagementTable,
  filters: DbFilter[],
  columns?: string[]
): Promise<{ rows: T[]; missing: boolean; truncated: boolean }> {
  try {
    const result = await selectAll<T>(ctx.db, table, {
      filters,
      columns,
      order: columns?.includes("created_at") || !columns ? [{ column: "created_at", ascending: true }] : undefined
    });
    return { rows: result.rows, missing: false, truncated: result.truncated };
  } catch (error) {
    if (error instanceof EngagementError && error.code === "setup_required") return { rows: [], missing: true, truncated: false };
    throw error;
  }
}

function dateFilters(column: string, prior: Range, range: Range): DbFilter[] {
  return [
    { column, op: "gte", value: prior.startIso },
    { column, op: "lt", value: range.endIso }
  ];
}

function roster(ctx: ServiceContext, directoryEmployees: EngagementEmployee[], department: DepartmentKey | null) {
  return directoryEmployees.filter(
    (employee) =>
      employee.active &&
      canViewEmployee(ctx.actor, employee) &&
      (!department || employee.departments.includes(department))
  );
}

function barkVisible(row: Pick<BarkOutRow, "author_departments" | "recipient_departments">, ctx: ServiceContext, department: string | null) {
  const departments = department ? [department] : scopeFilterDepartments(ctx.actor);
  if (!departments) return true;
  if (!departments.length) return false;
  return (
    row.author_departments.some((key) => departments.includes(key)) ||
    row.recipient_departments.some((key) => departments.includes(key))
  );
}

type Model = {
  generatedAt: string;
  range: Range;
  prior: Range;
  weekly: boolean;
  department: DepartmentKey | null;
  team: EngagementEmployee[];
  directory: Map<string, EngagementEmployee>;
  responses: BuiltResponse[];
  barks: BuiltBark[];
  anonymous: { withheldAnswers: number; includedAnswers: number; surveys: { title: string; count: number; minimum: number; withheld: boolean }[] };
  unavailable: string[];
  pulseReady: boolean;
  canExport: boolean;
  canManageTeam: boolean;
  truncated: boolean;
  scopeLabel: string;
  departments: { key: DepartmentKey; label: string }[];
};

async function loadModel(ctx: ServiceContext, input: { from?: unknown; to?: unknown; department?: unknown; userId?: unknown }): Promise<Model> {
  requireStorage(ctx);
  const range = parseRange(ctx, input, 30);
  const prior = priorRange(range);
  const department = departmentFilter(ctx, input.department);
  const userId = input.userId && input.userId !== "all" ? requireUuid(input.userId, "team member") : null;
  const directory = await ctx.directory();
  let team = roster(ctx, directory.employees, department);
  if (userId) {
    const employee = directory.byId.get(userId);
    if (!employee || !employee.active || !canViewEmployee(ctx.actor, employee)) throw notFoundError("That team member");
    team = team.filter((person) => person.userId === userId);
  }
  const teamIds = new Set(team.map((employee) => employee.userId));
  const settings = await ctx.settings();
  const categoryLabels = new Map(settings.categories.map((category) => [category.key, category.label]));
  const canManageTeam = ctx.actor.permissions.includes("engagement.manage_team");
  const unavailable: string[] = [];
  const windowFilters = dateFilters("created_at", prior, range);
  const [pulse, voiceAnswers, voiceQuestions, surveys, anonymousAnswers, funAnswers, funQuestions, feedback, barkCreated, barkPublished] =
    await Promise.all([
      readOptional<PulseRow>(ctx, "team_engagement_team_pulse_responses", windowFilters),
      readOptional<VoiceAnswerRow>(ctx, "team_engagement_voice_responses", windowFilters),
      readOptional<{ id: string; survey_id: string; prompt: string; question_type: string }>(
        ctx,
        "team_engagement_voice_questions",
        [],
        ["id", "survey_id", "prompt", "question_type", "sort_order"]
      ),
      readOptional<{ id: string; title: string; anonymity_mode: string; departments: string[]; min_aggregate_responses: number }>(
        ctx,
        "team_engagement_voice_surveys",
        [],
        ["id", "title", "anonymity_mode", "departments", "min_aggregate_responses"]
      ),
      readOptional<{ id: string; survey_id: string; question_id: string; answer: unknown; created_at: string }>(
        ctx,
        "team_engagement_voice_anonymous_responses",
        windowFilters,
        ["id", "survey_id", "question_id", "created_at"]
      ),
      readOptional<{ id: string; question_id: string; responder_user_id: string; responder_name: string; body: string; created_at: string }>(
        ctx,
        "team_engagement_fun_question_responses",
        windowFilters
      ),
      readOptional<{ id: string; prompt: string }>(ctx, "team_engagement_fun_questions", [], ["id", "prompt"]),
      canManageTeam
        ? readOptional<FeedbackRow>(ctx, "team_engagement_feedback", windowFilters)
        : Promise.resolve({ rows: [] as FeedbackRow[], missing: false, truncated: false }),
      readOptional<BarkOutRow>(ctx, "team_engagement_bark_outs", windowFilters),
      readOptional<BarkOutRow>(ctx, "team_engagement_bark_outs", dateFilters("published_at", prior, range))
    ]);

  if (pulse.missing) unavailable.push("Team Pulse storage is not set up, so ratings and check-in answers are unavailable.");
  if (voiceAnswers.missing || surveys.missing) unavailable.push("Employee Voice storage is not set up, so survey answers are unavailable.");
  if (funAnswers.missing) unavailable.push("Fun Zone answer storage is not set up.");
  if (!canManageTeam) unavailable.push("Suggestions are hidden because this role cannot manage team feedback.");
  else if (feedback.missing) unavailable.push("Suggestion storage is not set up.");
  unavailable.push("Location and service area are not stored on team engagement records.");
  unavailable.push("Positive, neutral, and concern labels are not applied. Rating scales have no stored anchors, and free-text answers are not sentiment-scored.");

  const questionById = new Map(voiceQuestions.rows.map((row) => [row.id, row]));
  const surveyById = new Map(surveys.rows.map((row) => [row.id, row]));
  const funPrompt = new Map(funQuestions.rows.map((row) => [row.id, row.prompt]));
  const responses: BuiltResponse[] = [];
  const push = (row: BuiltResponse | null) => {
    if (row && responses.length < RESPONSE_CAP) responses.push(row);
  };

  for (const row of pulse.rows) {
    const employee = directory.byId.get(row.responder_user_id);
    if (!employee || !teamIds.has(employee.userId)) continue;
    const period = periodOf(row.created_at, range, prior);
    if (!period) continue;
    const base = {
      employeeId: employee.userId,
      employeeName: employee.name,
      department: departmentText(employee),
      source: "pulse" as const,
      sourceLabel: "Team Pulse",
      status: "Recorded",
      statusKey: "recorded",
      submittedAt: row.created_at,
      managementNotes: [] as string[],
      resolution: null,
      notesLimited: false,
      period
    };
    (
      [
        ["workload", "Workload (1–5)", row.workload_rating],
        ["support", "Support (1–5)", row.support_rating],
        ["connection", "Connection (1–5)", row.connection_rating]
      ] as const
    ).forEach(([key, question, value]) => {
      push({
        ...base,
        id: `pulse:${row.id}:${key}`,
        question,
        questionKey: `pulse:${key}`,
        answer: String(value),
        categoryKey: `pulse:${key}`,
        categoryLabel: question.replace(" (1–5)", ""),
        questionType: "pulse_rating"
      });
    });
    if (row.note && row.note.trim()) {
      push({
        ...base,
        id: `pulse:${row.id}:note`,
        question: "Optional note",
        questionKey: "pulse:note",
        answer: row.note,
        categoryKey: "pulse:note",
        categoryLabel: "Team Pulse note",
        questionType: "pulse_note"
      });
    }
  }

  for (const row of voiceAnswers.rows) {
    const employee = directory.byId.get(row.responder_user_id);
    if (!employee || !teamIds.has(employee.userId)) continue;
    const period = periodOf(row.created_at, range, prior);
    if (!period) continue;
    const question = questionById.get(row.question_id);
    const survey = surveyById.get(row.survey_id);
    if (survey?.anonymity_mode === "anonymous") continue;
    push({
      id: `voice:${row.id}`,
      employeeId: employee.userId,
      employeeName: employee.name,
      department: departmentText(employee),
      question: question?.prompt ?? "Employee Voice question",
      questionKey: `voice:${row.question_id}`,
      answer: exactAnswer(row.answer),
      categoryKey: `survey:${row.survey_id}`,
      categoryLabel: survey?.title ?? "Employee Voice",
      questionType: voiceQuestionType(question?.question_type ?? "text"),
      source: "voice",
      sourceLabel: "Employee Voice",
      status: "Recorded",
      statusKey: "recorded",
      submittedAt: row.created_at,
      managementNotes: [],
      resolution: null,
      notesLimited: false,
      period
    });
  }

  for (const row of funAnswers.rows) {
    const employee = directory.byId.get(row.responder_user_id);
    if (!employee || !teamIds.has(employee.userId)) continue;
    const period = periodOf(row.created_at, range, prior);
    if (!period) continue;
    push({
      id: `fun:${row.id}`,
      employeeId: employee.userId,
      employeeName: employee.name,
      department: departmentText(employee),
      question: funPrompt.get(row.question_id) ?? "Fun Zone question",
      questionKey: `fun:${row.question_id}`,
      answer: row.body,
      categoryKey: "fun",
      categoryLabel: "Fun Zone",
      questionType: "fun",
      source: "fun",
      sourceLabel: "Fun Zone",
      status: "Recorded",
      statusKey: "recorded",
      submittedAt: row.created_at,
      managementNotes: [],
      resolution: null,
      notesLimited: false,
      period
    });
  }

  const visibleFeedback = feedback.rows.filter((row) => {
    if (!row.submitter_user_id || !teamIds.has(row.submitter_user_id)) return false;
    return Boolean(periodOf(row.created_at, range, prior));
  });
  let notesByFeedback = new Map<string, string[]>();
  let notesLimited = false;
  if (canManageTeam && visibleFeedback.length && visibleFeedback.length <= 300) {
    const events = await readOptional<FeedbackEventRow>(ctx, "team_engagement_feedback_events", [
      { column: "feedback_id", op: "in", value: visibleFeedback.map((row) => row.id) }
    ]);
    if (events.missing) notesLimited = true;
    notesByFeedback = new Map();
    for (const event of events.rows) {
      if (event.event_type !== "internal_note" || !event.body) continue;
      const list = notesByFeedback.get(event.feedback_id) ?? [];
      list.push(event.body);
      notesByFeedback.set(event.feedback_id, list);
    }
  } else if (visibleFeedback.length > 300) notesLimited = true;

  for (const row of visibleFeedback) {
    const employee = directory.byId.get(row.submitter_user_id!)!;
    const period = periodOf(row.created_at, range, prior);
    if (!period) continue;
    const category = FEEDBACK_CATEGORY_LABELS[row.category as FeedbackCategory] ?? row.category;
    push({
      id: `feedback:${row.id}`,
      employeeId: employee.userId,
      employeeName: employee.name,
      department: departmentText(employee),
      question: row.subject,
      questionKey: `feedback:${row.id}`,
      answer: row.details,
      categoryKey: `feedback:${row.category}`,
      categoryLabel: category,
      questionType: "feedback",
      source: "feedback",
      sourceLabel: "Suggestion",
      status: FEEDBACK_STATUS_LABELS[row.status as FeedbackStatus] ?? row.status,
      statusKey: row.status,
      submittedAt: row.created_at,
      managementNotes: notesByFeedback.get(row.id) ?? [],
      resolution: row.resolution,
      notesLimited,
      period
    });
  }

  const barkMap = new Map<string, BarkOutRow>();
  for (const row of [...barkCreated.rows, ...barkPublished.rows]) barkMap.set(row.id, row);
  const barks: BuiltBark[] = [];
  for (const row of barkMap.values()) {
    if (!barkVisible(row, ctx, department)) continue;
    if (userId && row.author_user_id !== userId && row.recipient_user_id !== userId) continue;
    const when = row.status === "published" ? row.published_at ?? row.created_at : row.created_at;
    const period = periodOf(when, range, prior);
    if (!period) continue;
    const author = row.author_user_id ? directory.byId.get(row.author_user_id) : undefined;
    const recipient = row.recipient_user_id ? directory.byId.get(row.recipient_user_id) : undefined;
    barks.push({
      id: row.id,
      givenBy: row.author_name,
      givenById: row.author_user_id,
      givenByViewable: Boolean(author && canViewEmployee(ctx.actor, author)),
      receivedBy: row.recipient_name,
      receivedById: row.recipient_user_id,
      receivedByViewable: Boolean(recipient && canViewEmployee(ctx.actor, recipient)),
      message: row.message,
      context: row.context,
      categoryKey: row.category,
      categoryLabel: categoryLabels.get(row.category) ?? row.category.replace(/_/g, " "),
      status: row.status,
      statusLabel: BARK_OUT_STATUS_LABELS[row.status as BarkOutStatus] ?? row.status,
      submittedAt: row.created_at,
      publishedAt: row.published_at,
      senderDepartment: row.author_departments.map((key) => departmentLabel(key)).join(", ") || "No department",
      recipientDepartment: row.recipient_departments.map((key) => departmentLabel(key)).join(", ") || "No department",
      authorDepartments: row.author_departments,
      recipientDepartments: row.recipient_departments,
      period
    });
  }

  const anonymousSurveys: Model["anonymous"]["surveys"] = [];
  let withheldAnswers = 0;
  let includedAnswers = 0;
  const scopedDepartments = department ? [department] : scopeFilterDepartments(ctx.actor);
  for (const survey of surveys.rows) {
    if (survey.anonymity_mode !== "anonymous") continue;
    if (scopedDepartments && survey.departments.length && !survey.departments.some((key) => scopedDepartments.includes(key))) continue;
    const count = anonymousAnswers.rows.filter((row) => row.survey_id === survey.id && periodOf(row.created_at, range, prior) === "current").length;
    if (!count) continue;
    const minimum = survey.min_aggregate_responses || 5;
    const withheld = count < minimum;
    if (withheld) withheldAnswers += count;
    else includedAnswers += count;
    anonymousSurveys.push({ title: survey.title, count, minimum, withheld });
  }
  const optionDepartments = (ctx.actor.scope.all ? [...ENGAGEMENT_DEPARTMENTS] : [...ctx.actor.scope.departments]).map((key) => ({
    key,
    label: departmentLabel(key)
  }));

  return {
    generatedAt: ctx.now().toISOString(),
    range,
    prior,
    weekly: range.days > 45,
    department,
    team,
    directory: directory.byId,
    responses,
    barks,
    anonymous: { withheldAnswers, includedAnswers, surveys: anonymousSurveys },
    unavailable,
    pulseReady: !pulse.missing,
    canExport: ctx.actor.permissions.includes("engagement.export"),
    canManageTeam,
    truncated: [pulse, voiceAnswers, anonymousAnswers, funAnswers, feedback, barkCreated, barkPublished].some((result) => result.truncated) || responses.length >= RESPONSE_CAP,
    scopeLabel: scopeLabel(ctx.actor.scope),
    departments: optionDepartments
  };
}

function currentResponses(model: Model, input: { source?: unknown; questionType?: unknown; category?: unknown }) {
  const source = typeof input.source === "string" && input.source !== "all" ? input.source : null;
  const questionType = typeof input.questionType === "string" && input.questionType !== "all" ? input.questionType : null;
  const category = typeof input.category === "string" && input.category !== "all" ? input.category : null;
  return model.responses.filter((row) => {
    if (row.period !== "current") return false;
    if (source && row.source !== source) return false;
    if (questionType && row.questionType !== questionType) return false;
    if (category && row.categoryKey !== category) return false;
    return true;
  });
}

function priorResponses(model: Model) {
  return model.responses.filter((row) => row.period === "prior");
}

function published(barks: BuiltBark[], period: "current" | "prior") {
  return barks.filter((row) => row.period === period && row.status === "published");
}

function participants(responses: BuiltResponse[], barks: BuiltBark[], teamIds: Set<string>) {
  const ids = new Set<string>();
  for (const row of responses) if (teamIds.has(row.employeeId)) ids.add(row.employeeId);
  for (const bark of barks) if (bark.givenById && teamIds.has(bark.givenById)) ids.add(bark.givenById);
  return ids;
}

function ratingValues(responses: BuiltResponse[]) {
  return responses.filter((row) => row.questionType === "pulse_rating").map((row) => Number(row.answer)).filter((value) => Number.isFinite(value));
}

function buildStaff(model: Model, responses: BuiltResponse[], priorRows: BuiltResponse[], barks: BuiltBark[], priorBarks: BuiltBark[]): StaffItem[] {
  const weeks = weekKeys(model.range);
  const byEmployee = new Map<string, BuiltResponse[]>();
  for (const row of responses) {
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  const priorByEmployee = new Map<string, BuiltResponse[]>();
  for (const row of priorRows) {
    const list = priorByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    priorByEmployee.set(row.employeeId, list);
  }
  return model.team
    .map((employee) => {
      const mine = byEmployee.get(employee.userId) ?? [];
      const previous = priorByEmployee.get(employee.userId) ?? [];
      const ratings = ratingValues(mine);
      const priorRatings = ratingValues(previous);
      const score = ratings.length ? percent(mean(ratings) ?? 0, 5) : null;
      const priorScore = priorRatings.length ? percent(mean(priorRatings) ?? 0, 5) : null;
      const pulseWeeks = new Set(mine.filter((row) => row.source === "pulse").map((row) => pacificDateKey(row.submittedAt)).filter(Boolean));
      const gave = barks.filter((row) => row.givenById === employee.userId).length;
      const received = barks.filter((row) => row.receivedById === employee.userId).length;
      const priorGave = priorBarks.filter((row) => row.givenById === employee.userId).length;
      const participated = mine.length > 0 || gave > 0;
      const priorParticipated = previous.length > 0 || priorGave > 0;
      let trend: StaffItem["trend"] = "none";
      if (score != null && priorScore != null) {
        if (score - priorScore >= 4) trend = "up";
        else if (priorScore - score >= 4) trend = "down";
        else trend = "flat";
      } else if (score != null && priorScore == null) trend = "up";
      else if (score == null && priorScore != null) trend = "down";
      else if (participated !== priorParticipated) trend = participated ? "up" : "down";
      else if (participated || priorParticipated) trend = "flat";
      return {
        userId: employee.userId,
        name: employee.name,
        title: employee.title,
        department: departmentText(employee),
        engagementScore: score,
        responses: mine.length,
        barkOutsGiven: gave,
        barkOutsReceived: received,
        participated,
        pulseParticipation: model.pulseReady && weeks.length ? percent(pulseWeeks.size, weeks.length) : null,
        trend
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildInsights(model: Model, responses: BuiltResponse[], priorRows: BuiltResponse[], barks: BuiltBark[], score: number | null, priorScore: number | null): InsightItem[] {
  const insights: InsightItem[] = [];
  if (score != null && priorScore != null && score !== priorScore) {
    const diff = score - priorScore;
    insights.push({
      id: "participation",
      tone: diff > 0 ? "positive" : "attention",
      title: diff > 0 ? "Participation increased" : "Participation declined",
      detail: `${score}% of ${model.team.length} teammates you can view participated, ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} points from ${priorScore}% in ${model.prior.from} to ${model.prior.to}.`,
      formula: ENGAGEMENT_SCORE_FORMULA
    });
  }
  const departments = model.department ? [model.department] : model.departments.map((row) => row.key);
  let worst: { label: string; diff: number; current: number; prior: number; headcount: number } | null = null;
  for (const key of departments) {
    const members = model.team.filter((employee) => employee.departments.includes(key));
    if (members.length < 3) continue;
    const ids = new Set(members.map((employee) => employee.userId));
    const nowIds = participants(responses.filter((row) => ids.has(row.employeeId)), barks.filter((row) => row.givenById && ids.has(row.givenById)), ids);
    const thenIds = participants(
      priorRows.filter((row) => ids.has(row.employeeId)),
      model.barks.filter((row) => row.period === "prior" && row.status === "published" && row.givenById && ids.has(row.givenById)),
      ids
    );
    const current = percent(nowIds.size, members.length)!;
    const prior = percent(thenIds.size, members.length)!;
    const diff = current - prior;
    if (diff <= -15 && (!worst || diff < worst.diff)) worst = { label: departmentLabel(key), diff, current, prior, headcount: members.length };
  }
  if (worst) {
    insights.push({
      id: `department:${worst.label}`,
      tone: "attention",
      title: `${worst.label} participation declined`,
      detail: `${worst.label} participation is ${worst.current}% (${worst.headcount} teammates), down ${Math.abs(worst.diff)} points from ${worst.prior}% in the previous period. People in more than one department are counted in each.`,
      formula: "Department participants ÷ active teammates in that department you can view."
    });
  }
  const received = new Map<string, { name: string; count: number }>();
  for (const bark of barks) {
    if (!bark.receivedById) continue;
    const entry = received.get(bark.receivedById) ?? { name: bark.receivedBy, count: 0 };
    entry.count += 1;
    received.set(bark.receivedById, entry);
  }
  for (const [id, entry] of [...received.entries()].filter(([, entry]) => entry.count >= 3).sort((a, b) => b[1].count - a[1].count).slice(0, 3)) {
    insights.push({
      id: `recognized:${id}`,
      tone: "info",
      title: `${entry.name} received ${entry.count} Bark Outs`,
      detail: `${entry.name} is the recipient on ${entry.count} posted Bark Outs in this range. Receiving recognition is not a job-performance score.`,
      formula: "Count of posted Bark Outs whose recipient is this teammate."
    });
  }
  const byCategory = new Map<string, { label: string; people: Set<string> }>();
  for (const row of responses.filter((item) => item.source === "feedback")) {
    const entry = byCategory.get(row.categoryKey) ?? { label: row.categoryLabel, people: new Set<string>() };
    entry.people.add(row.employeeId);
    byCategory.set(row.categoryKey, entry);
  }
  for (const [key, entry] of byCategory) {
    if (entry.people.size < 3) continue;
    insights.push({
      id: `feedback:${key}`,
      tone: "attention",
      title: `${entry.people.size} teammates wrote ${entry.label} suggestions`,
      detail: `${entry.people.size} teammates submitted a suggestion in ${entry.label}. Open Responses and filter to that category to read the original text.`,
      formula: "Distinct teammates with a suggestion in this category during the selected dates."
    });
  }
  const repeated = new Map<string, { question: string; answer: string; people: Set<string> }>();
  for (const row of responses) {
    const normalized = row.answer.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 180) continue;
    const key = `${row.questionKey}\n${normalized}`;
    const entry = repeated.get(key) ?? { question: row.question, answer: row.answer, people: new Set<string>() };
    entry.people.add(row.employeeId);
    repeated.set(key, entry);
  }
  for (const [key, entry] of repeated) {
    if (entry.people.size < 3) continue;
    insights.push({
      id: `repeat:${key.slice(0, 80)}`,
      tone: "info",
      title: `${entry.people.size} teammates gave the same answer`,
      detail: `${entry.people.size} teammates answered “${entry.question}” with the same stored text: “${entry.answer}”.`,
      formula: "Identical stored answer text, compared without changing the original."
    });
    break;
  }
  for (const dimension of ["Workload", "Support", "Connection"] as const) {
    const now = mean(ratingValues(responses.filter((row) => row.categoryLabel === dimension)));
    const then = mean(ratingValues(priorRows.filter((row) => row.categoryLabel === dimension)));
    if (now == null || then == null || Math.abs(now - then) < 0.4) continue;
    insights.push({
      id: `pulse:${dimension}`,
      tone: "info",
      title: `${dimension} ratings moved`,
      detail: `Mean ${dimension} (1–5) is ${now} in this period and was ${then} in the previous period. No favorable end of the scale is stored.`,
      formula: TEAM_RATING_FORMULA
    });
  }
  for (const survey of model.anonymous.surveys.filter((row) => row.withheld)) {
    insights.push({
      id: `anon:${survey.title}`,
      tone: "info",
      title: `${survey.title} stays aggregated`,
      detail: `${survey.title} has ${survey.count} anonymous ${survey.count === 1 ? "answer" : "answers"}, below its minimum of ${survey.minimum}. Individual anonymous answers are not shown, and the aggregate is withheld.`,
      formula: "Anonymous Employee Voice answers stay hidden, and aggregates wait for the survey's minimum response count."
    });
  }
  if (!insights.length) {
    insights.push({
      id: "quiet",
      tone: "info",
      title: responses.length || barks.length ? "No large swing in this range" : "No engagement records in this range",
      detail: responses.length || barks.length
        ? "Participation, department rates, repeated answers, and Bark Out totals did not cross the thresholds used for an alert."
        : "Team Pulse, identified surveys, Fun Zone answers, suggestions, and posted Bark Outs are empty for these filters.",
      formula: "Alerts use the thresholds described on each insight. Nothing here is generated as a narrative."
    });
  }
  return insights.slice(0, 8);
}

function seriesFor(model: Model, scoreResponses: BuiltResponse[], chartResponses: BuiltResponse[], barks: BuiltBark[]) {
  const keys = bucketKeys(model.range, model.weekly);
  const teamIds = new Set(model.team.map((employee) => employee.userId));
  return keys.map((key) => {
    const inBucket = (iso: string) => {
      const date = pacificDateKey(iso);
      return Boolean(date && bucketKey(date, model.weekly) === key);
    };
    const bucketScore = scoreResponses.filter((row) => inBucket(row.submittedAt));
    const bucketChart = chartResponses.filter((row) => inBucket(row.submittedAt));
    const bucketBarks = barks.filter((row) => row.publishedAt && inBucket(row.publishedAt));
    const people = participants(bucketScore, bucketBarks, teamIds);
    return {
      date: key,
      label: new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      engagementScore: percent(people.size, model.team.length),
      barkOuts: bucketBarks.length,
      responses: bucketChart.length,
      participants: people.size,
      pulse: bucketChart.filter((row) => row.source === "pulse").length,
      voice: bucketChart.filter((row) => row.source === "voice").length,
      fun: bucketChart.filter((row) => row.source === "fun").length,
      feedback: bucketChart.filter((row) => row.source === "feedback").length
    };
  });
}

function categoriesFor(responses: BuiltResponse[]) {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const row of responses) {
    const entry = counts.get(row.categoryKey) ?? { key: row.categoryKey, label: row.categoryLabel, count: 0 };
    entry.count += 1;
    counts.set(row.categoryKey, entry);
  }
  const total = responses.length;
  return [...counts.values()]
    .map((entry) => ({ ...entry, percent: total ? Math.round((entry.count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function departmentsFor(model: Model, responses: BuiltResponse[], priorRows: BuiltResponse[], barks: BuiltBark[]) {
  const keys = model.department ? [model.department] : model.departments.map((row) => row.key);
  return keys.map((key) => {
    const members = model.team.filter((employee) => employee.departments.includes(key));
    const ids = new Set(members.map((employee) => employee.userId));
    const now = participants(responses.filter((row) => ids.has(row.employeeId)), barks.filter((row) => row.givenById && ids.has(row.givenById)), ids);
    const then = participants(
      priorRows.filter((row) => ids.has(row.employeeId)),
      model.barks.filter((row) => row.period === "prior" && row.status === "published" && row.givenById && ids.has(row.givenById)),
      ids
    );
    return {
      key,
      label: departmentLabel(key),
      headcount: members.length,
      participationRate: percent(now.size, members.length),
      priorParticipationRate: percent(then.size, members.length),
      responses: responses.filter((row) => ids.has(row.employeeId)).length,
      barkOutsGiven: barks.filter((row) => row.authorDepartments.includes(key)).length,
      barkOutsReceived: barks.filter((row) => row.recipientDepartments.includes(key)).length
    };
  });
}

function leaderboard(staff: StaffItem[], barks: BuiltBark[]) {
  return staff
    .filter((person) => person.barkOutsGiven > 0 || person.barkOutsReceived > 0)
    .map((person) => {
      const latest = barks
        .filter((row) => row.receivedById === person.userId)
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
      return {
        userId: person.userId,
        name: person.name,
        department: person.department,
        received: person.barkOutsReceived,
        given: person.barkOutsGiven,
        latestAt: latest?.publishedAt ?? null,
        latestMessage: latest?.message ?? null
      };
    })
    .sort((a, b) => b.received - a.received || b.given - a.given || a.name.localeCompare(b.name));
}

function sortResponses(rows: ResponseItem[], sort: string, dir: "asc" | "desc") {
  const factor = dir === "asc" ? 1 : -1;
  const value = (row: ResponseItem) => (sort === "employee" ? row.employeeName : sort === "question" ? row.question : row.submittedAt);
  return [...rows].sort((a, b) => factor * value(a).localeCompare(value(b)) || a.id.localeCompare(b.id));
}

function searchRows(rows: ResponseItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => haystack(row).includes(needle));
}

function kpis(model: Model, responses: BuiltResponse[], priorRows: BuiltResponse[], barks: BuiltBark[], priorBarks: BuiltBark[]) {
  const teamIds = new Set(model.team.map((employee) => employee.userId));
  const score = percent(participants(responses, barks, teamIds).size, model.team.length);
  const previousScore = percent(participants(priorRows, priorBarks, teamIds).size, model.team.length);
  const rating = mean(ratingValues(responses));
  const priorRating = mean(ratingValues(priorRows));
  const questions = new Set(responses.map((row) => row.questionKey));
  const unreviewed = model.canManageTeam ? responses.filter((row) => row.source === "feedback" && UNREVIEWED.has(row.statusKey)).length : null;
  return {
    teamMembers: {
      value: model.team.length,
      delta: { direction: "flat" as const, label: "Current active team you can view" },
      formula: "Active teammates you are allowed to open. Your own record is excluded. Headcount history is not stored, so this is not compared with the prior period."
    },
    engagementScore: {
      value: score,
      prior: previousScore,
      delta: pointDelta(score, previousScore, "pts vs prior period"),
      formula: ENGAGEMENT_SCORE_FORMULA
    },
    responses: {
      value: responses.length,
      delta: countDelta(responses.length, priorRows.length),
      formula: RESPONSE_COUNT_FORMULA
    },
    barkOuts: {
      value: barks.length,
      delta: countDelta(barks.length, priorBarks.length),
      formula: "Posted Bark Outs in the selected dates, inside your department scope. The sender is the author and the recipient is the person recognized."
    },
    teamRating: {
      value: rating,
      scale: rating == null ? null : (`${rating} / 5` as const),
      delta: pointDelta(rating, priorRating, "vs prior period"),
      formula: TEAM_RATING_FORMULA,
      available: model.pulseReady
    },
    uniqueEmployees: participants(responses, [], teamIds).size,
    questionsAnswered: questions.size,
    participationRate: score,
    unreviewed,
    classification: null as null,
    classificationReason: "Rating scales do not store a positive end, and free-text answers are not scored. Counts of positive, neutral, and concern answers are omitted."
  };
}

function stripPeriod(row: BuiltResponse): ResponseItem {
  const { period: _period, ...item } = row;
  return item;
}

function stripBark(row: BuiltBark): BarkItem {
  const { period: _period, authorDepartments: _author, recipientDepartments: _recipient, ...item } = row;
  return item;
}

export async function analyticsIntelligence(ctx: ServiceContext, input: Record<string, unknown>) {
  const model = await loadModel(ctx, input);
  const tab = TABS.includes(input.tab as Tab) ? (input.tab as Tab) : "overview";
  if (tab === "profile" && (!input.userId || input.userId === "all")) throw validationError("Choose a team member.");
  const scopedResponses = model.responses.filter((row) => row.period === "current");
  const listed = currentResponses(model, input);
  const priorRows = priorResponses(model);
  const barks = published(model.barks, "current");
  const priorBarks = published(model.barks, "prior");
  const summary = kpis(model, scopedResponses, priorRows, barks, priorBarks);
  const responseSummary = kpis(model, listed, priorRows, barks, priorBarks);
  const staff = buildStaff(model, scopedResponses, priorRows, barks, priorBarks);
  const insights = buildInsights(model, scopedResponses, priorRows, barks, summary.engagementScore.value, summary.engagementScore.prior);
  const query = typeof input.q === "string" ? input.q.slice(0, 80) : "";
  const searched = searchRows(listed.map(stripPeriod), query);
  const sort = input.sort === "employee" || input.sort === "question" ? input.sort : "submittedAt";
  const dir = input.dir === "asc" ? "asc" : "desc";
  const sortedResponses = sortResponses(searched, sort, dir);
  const page = input.exportAll
    ? { page: 1, pageSize: sortedResponses.length, total: sortedResponses.length, pages: 1, items: sortedResponses.slice(0, 2000) }
    : pageOf(sortedResponses, Math.max(1, Math.min(10000, Math.floor(Number(input.page)) || 1)));
  const barkQuery = typeof input.barkQ === "string" ? input.barkQ.trim().toLowerCase().slice(0, 80) : "";
  const barkRows = barks
    .map(stripBark)
    .filter((row) => !barkQuery || `${row.givenBy}\n${row.receivedBy}\n${row.message}\n${row.categoryLabel}`.toLowerCase().includes(barkQuery))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || a.id.localeCompare(b.id));
  const barkPage = input.exportAll
    ? { page: 1, pageSize: barkRows.length, total: barkRows.length, pages: 1, items: barkRows.slice(0, 2000) }
    : pageOf(barkRows, Math.max(1, Math.min(10000, Math.floor(Number(input.barkPage)) || 1)));
  const includeDetails = Boolean(input.exportAll) || tab === "responses" || tab === "reports" || tab === "profile";
  const includeBarks = Boolean(input.exportAll) || tab === "bark_outs" || tab === "reports" || tab === "profile";
  const recent = [...listed].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id)).slice(0, 6).map(stripPeriod);
  const focusEmployee = model.team.length === 1 && input.userId && input.userId !== "all" ? model.team[0] : null;
  const focus = focusEmployee
    ? {
        employee: {
          userId: focusEmployee.userId,
          name: focusEmployee.name,
          title: focusEmployee.title,
          department: departmentText(focusEmployee),
          roleLabel: roleLabel(focusEmployee.legacyRole),
          active: focusEmployee.active
        },
        responses: listed.filter((row) => row.employeeId === focusEmployee.userId).map(stripPeriod).slice(0, 100),
        barkOutsGiven: barks.filter((row) => row.givenById === focusEmployee.userId).map(stripBark).slice(0, 50),
        barkOutsReceived: barks.filter((row) => row.receivedById === focusEmployee.userId).map(stripBark).slice(0, 50),
        activity: staff.find((person) => person.userId === focusEmployee.userId) ?? null,
        note: "Participation and recognition describe engagement activity. They are not a job-performance evaluation."
      }
    : null;

  return {
    generatedAt: model.generatedAt,
    tab,
    range: { from: model.range.from, to: model.range.to, days: model.range.days, bucket: model.weekly ? "week" : "day" },
    priorRange: { from: model.prior.from, to: model.prior.to },
    scope: { label: model.scopeLabel },
    department: model.department ? { key: model.department, label: departmentLabel(model.department) } : null,
    definitions: {
      engagementScore: ENGAGEMENT_SCORE_FORMULA,
      teamRating: TEAM_RATING_FORMULA,
      responses: RESPONSE_COUNT_FORMULA,
      privacy: "Anonymous Employee Voice answers are never listed with a name. Identified answers are limited to teammates you can view, excluding yourself."
    },
    unavailable: model.unavailable,
    permissions: { canExport: model.canExport, canManageTeam: model.canManageTeam },
    filters: {
      locationAvailable: false,
      serviceAreaAvailable: false,
      departments: model.departments,
      employees: model.team.map((employee) => ({ userId: employee.userId, name: employee.name, department: departmentText(employee) })).sort((a, b) => a.name.localeCompare(b.name)),
      sources: [
        { key: "pulse", label: "Team Pulse" },
        { key: "voice", label: "Employee Voice" },
        { key: "fun", label: "Fun Zone" },
        { key: "feedback", label: "Suggestion" }
      ],
      questionTypes: [
        { key: "pulse_rating", label: "Team Pulse rating" },
        { key: "pulse_note", label: "Team Pulse note" },
        { key: "voice_text", label: "Survey text" },
        { key: "voice_rating", label: "Survey rating" },
        { key: "voice_yes_no", label: "Survey yes / no" },
        { key: "voice_choice", label: "Survey choice" },
        { key: "fun", label: "Fun Zone answer" },
        { key: "feedback", label: "Suggestion" }
      ],
      categories: categoriesFor(scopedResponses).map((row) => ({ key: row.key, label: row.label }))
    },
    kpis: summary,
    responseKpis: {
      total: responseSummary.responses.value,
      uniqueEmployees: new Set(listed.map((row) => row.employeeId)).size,
      questionsAnswered: new Set(listed.map((row) => row.questionKey)).size,
      participationRate: summary.participationRate,
      unreviewed: summary.unreviewed,
      classification: null,
      classificationReason: summary.classificationReason
    },
    series: seriesFor(model, scopedResponses, listed, barks),
    categories: categoriesFor(listed),
    departments: departmentsFor(model, scopedResponses, priorRows, barks),
    staff,
    insights,
    recentResponses: recent,
    anonymous: model.anonymous,
    truncated: model.truncated,
    responses: includeDetails ? page : { page: page.page, pageSize: page.pageSize, total: page.total, pages: page.pages, items: [] as ResponseItem[] },
    barkOuts: includeBarks
      ? {
          ...barkPage,
          given: new Set(barks.map((row) => row.givenById).filter(Boolean)).size,
          received: new Set(barks.map((row) => row.receivedById).filter(Boolean)).size,
          leaderboard: leaderboard(staff, barks).slice(0, 20)
        }
      : null,
    focus: input.userId && input.userId !== "all" ? focus : null,
    templates: REPORT_TEMPLATES.map((template) => ({ id: template.id, label: template.label, description: template.description, sections: [...template.sections] })),
    limits: { maxRangeDays: 366, note: "Analytics reads at most one year at a time." }
  };
}

export type IntelligencePayload = Awaited<ReturnType<typeof analyticsIntelligence>>;

function exportSections(input: Record<string, unknown>, templateId: ReportTemplateId) {
  const template = REPORT_TEMPLATES.find((item) => item.id === templateId)!;
  const requested = typeof input.sections === "string" && input.sections.trim() ? input.sections.split(",").map((item) => item.trim()) : [...template.sections];
  return requested.filter((section) => (template.sections as readonly string[]).includes(section));
}

function isTemplate(value: unknown): value is ReportTemplateId {
  return REPORT_TEMPLATES.some((template) => template.id === value);
}

export async function engagementExportTable(ctx: ServiceContext, input: Record<string, unknown>) {
  if (!isTemplate(input.type)) throw validationError("Choose a report to export.");
  const data = await analyticsIntelligence(ctx, { ...input, tab: "reports", exportAll: true });
  const sections = new Set(exportSections(input, input.type));
  const header = ["Section", "Item", "Value", "Notes"];
  const rows: unknown[][] = [];
  const add = (section: string, item: string, value: unknown, notes = "") => {
    if (sections.has(section)) rows.push([section, item, value ?? "", notes]);
  };
  add("about", "What this report measures", "Engagement activity, not a job-performance evaluation", data.definitions.privacy);
  add("about", "Dates", `${data.range.from} to ${data.range.to}`, `Compared with ${data.priorRange.from} to ${data.priorRange.to}`);
  add("about", "Scope", data.scope.label, data.department?.label ?? "All departments in scope");
  add("totals", "Team members", data.kpis.teamMembers.value, data.kpis.teamMembers.formula);
  add("totals", "Engagement score", data.kpis.engagementScore.value == null ? "Unavailable" : `${data.kpis.engagementScore.value}%`, data.kpis.engagementScore.formula);
  add("totals", "Identified responses", data.kpis.responses.value, data.kpis.responses.formula);
  add("totals", "Posted Bark Outs", data.kpis.barkOuts.value, data.kpis.barkOuts.formula);
  add("totals", "Team Pulse average", data.kpis.teamRating.value ?? "Unavailable", data.kpis.teamRating.formula);
  for (const category of data.categories) add("categories", category.label, category.count, `${category.percent}% of identified responses`);
  for (const department of data.departments) {
    add("departments", department.label, department.participationRate == null ? "No teammates" : `${department.participationRate}% participated`, `${department.responses} responses · ${department.barkOutsReceived} Bark Outs received · ${department.barkOutsGiven} given`);
  }
  for (const person of data.staff) {
    add("staff", person.name, person.engagementScore == null ? "No Team Pulse rating" : `${person.engagementScore}% pulse average`, `${person.department} · ${person.responses} responses · ${person.barkOutsGiven} given · ${person.barkOutsReceived} received · ${person.participated ? "participated" : "no activity"}`);
  }
  for (const insight of data.insights) add("insights", insight.title, insight.detail, insight.formula);
  if (input.type === "employee_engagement") {
    if (!data.focus) add("employee", "Team member", "Choose a team member to export this report.", "");
    else add("employee", data.focus.employee.name, data.focus.employee.department, data.focus.employee.title ?? data.focus.note);
  }
  for (const row of sections.has("responses") ? (data.responses?.items ?? []) : []) {
    rows.push(["responses", `${row.employeeName} — ${row.question}`, row.answer, `${row.department} · ${row.categoryLabel} · ${row.status} · ${row.submittedAt}`]);
  }
  const recognition = data.barkOuts?.items ?? [];
  for (const row of sections.has("recognition") ? recognition : []) {
    rows.push(["recognition", `${row.givenBy} gave recognition to ${row.receivedBy}`, row.message, `${row.categoryLabel} · ${row.recipientDepartment} · ${row.publishedAt ?? row.submittedAt}`]);
  }
  for (const row of data.barkOuts?.leaderboard ?? []) {
    add("leaderboard", row.name, `${row.received} received · ${row.given} given`, row.department);
  }
  if (!rows.length) rows.push(["about", "No rows", "Nothing in these sections matched the filters.", ""]);
  return { header, rows };
}
