import type { DepartmentKey } from "@/lib/admin/permissions";
import type {
  AuditCategory,
  BarkOutReaction,
  BarkOutStatus,
  DevelopmentRecordType,
  DevelopmentStatus,
  DevelopmentVisibility,
  FeedbackCategory,
  FeedbackStatus,
  ModerationOutcome,
  NominationStatus,
  ProgramCadence,
  ProgramStatus,
  ProgramType
} from "@/lib/team-engagement/constants";
import type { DepartmentScope, EngagementPermission, TeamEngagementTier } from "@/lib/team-engagement/permissions";

export const ENGAGEMENT_TABLES = [
  "team_engagement_bark_outs",
  "team_engagement_moderation_events",
  "team_engagement_reactions",
  "team_engagement_reports",
  "team_engagement_development_records",
  "team_engagement_feedback",
  "team_engagement_feedback_events",
  "team_engagement_announcements",
  "team_engagement_programs",
  "team_engagement_nominations",
  "team_engagement_department_profiles",
  "team_engagement_department_managers",
  "team_engagement_settings",
  "team_engagement_preferences",
  "team_engagement_audit_events"
] as const;
export type EngagementTable = (typeof ENGAGEMENT_TABLES)[number];

export type BarkOutRow = {
  id: string;
  author_user_id: string | null;
  author_name: string;
  author_departments: string[];
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_departments: string[];
  category: string;
  message: string;
  context: string | null;
  status: BarkOutStatus;
  moderation_outcome: ModerationOutcome;
  author_confirmations: number;
  author_prompt: string | null;
  author_notice: string | null;
  content_fingerprint: string;
  escalated_at: string | null;
  escalation_note: string | null;
  open_report_count: number;
  published_at: string | null;
  decided_at: string | null;
  decided_by_user_id: string | null;
  decided_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ModerationEventType =
  | "screened"
  | "ai_review"
  | "author_confirmed"
  | "moderator_decision"
  | "report_filed"
  | "report_resolved"
  | "escalated"
  | "withdrawn"
  | "auto_hidden";

export type ModerationEventRow = {
  id: string;
  bark_out_id: string;
  event_type: ModerationEventType;
  outcome: string | null;
  reason_codes: string[];
  moderator_note: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_confidence: number | null;
  actor_user_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export type ReactionRow = {
  id: string;
  bark_out_id: string;
  user_id: string;
  reaction: BarkOutReaction;
  created_at: string;
};

export type ConcernReportStatus = "open" | "kept" | "removed" | "dismissed";

export type ConcernReportRow = {
  id: string;
  bark_out_id: string;
  reporter_user_id: string | null;
  reporter_name: string;
  reason: string;
  status: ConcernReportStatus;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DevelopmentRecordRow = {
  id: string;
  employee_user_id: string;
  employee_name: string;
  employee_departments: string[];
  record_type: DevelopmentRecordType;
  title: string;
  details: string | null;
  status: DevelopmentStatus;
  visibility: DevelopmentVisibility;
  due_on: string | null;
  completed_at: string | null;
  created_by_user_id: string | null;
  created_by_name: string;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackRow = {
  id: string;
  submitter_user_id: string | null;
  submitter_name: string;
  submitter_departments: string[];
  category: FeedbackCategory;
  about_department: DepartmentKey | null;
  subject: string;
  details: string;
  status: FeedbackStatus;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  follow_up_on: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackEventType = "submitted" | "status_changed" | "response" | "internal_note" | "assigned" | "follow_up_set";

export type FeedbackEventRow = {
  id: string;
  feedback_id: string;
  event_type: FeedbackEventType;
  body: string | null;
  visible_to_submitter: boolean;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  actor_name: string;
  created_at: string;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience_departments: string[];
  status: "published" | "archived";
  created_by_user_id: string | null;
  created_by_name: string;
  published_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgramRow = {
  id: string;
  program_type: ProgramType;
  name: string;
  description: string | null;
  criteria: string | null;
  cadence: ProgramCadence;
  status: ProgramStatus;
  nominations_open: boolean;
  created_by_user_id: string | null;
  created_by_name: string;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type NominationRow = {
  id: string;
  program_id: string;
  nominee_user_id: string;
  nominee_name: string;
  nominee_departments: string[];
  nominated_by_user_id: string | null;
  nominated_by_name: string;
  period_label: string;
  reason: string;
  status: NominationStatus;
  decision_note: string | null;
  decided_by_user_id: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DepartmentProfileRow = {
  department_key: DepartmentKey;
  description: string | null;
  recognition_enabled: boolean;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

export type DepartmentManagerRow = {
  department_key: DepartmentKey;
  manager_user_id: string;
  assigned_by_user_id: string | null;
  assigned_by_name: string | null;
  created_at: string;
};

export type SettingKey = "categories" | "participation" | "ai_policy" | "features" | "retention";

export type SettingRow = {
  setting_key: SettingKey;
  value: unknown;
  revision: number;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

export type PreferenceRow = {
  user_id: string;
  show_on_team_feed: boolean;
  notify_on_bark_out: boolean;
  updated_at: string;
};

export type AuditEventRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  category: AuditCategory;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  scope: string | null;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
};

/** RuffOps login joined with its staff directory entry. Email stays on the server. */
export type EngagementEmployee = {
  userId: string;
  name: string;
  email: string;
  title: string | null;
  departmentLabel: string | null;
  departments: DepartmentKey[];
  tier: TeamEngagementTier | null;
  legacyRole: string;
  active: boolean;
};

export type EngagementActor = {
  userId: string;
  name: string;
  email: string;
  legacyRole: string;
  tier: TeamEngagementTier | null;
  permissions: EngagementPermission[];
  scope: DepartmentScope;
  departments: DepartmentKey[];
  impersonated: boolean;
};

export type DbScalar = string | number | boolean;

export type DbFilter =
  | { column: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: DbScalar }
  | { column: string; op: "in" | "not_in"; value: DbScalar[] }
  | { column: string; op: "ov" | "cs"; value: string[] }
  | { column: string; op: "is_null" | "not_null" }
  | { column: string; op: "ilike"; value: string }
  | { op: "or"; filters: DbFilter[] };

export type DbQuery = {
  /** Columns to read; every column when omitted. */
  columns?: readonly string[];
  filters?: DbFilter[];
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  offset?: number;
  count?: boolean;
};

export type DbOp =
  | { op: "insert"; table: EngagementTable; values: Record<string, unknown> }
  | { op: "upsert"; table: EngagementTable; values: Record<string, unknown>; conflict: string[] }
  | { op: "update"; table: EngagementTable; match: Record<string, unknown>; set: Record<string, unknown>; expectRows?: number }
  | { op: "delete"; table: EngagementTable; match: Record<string, unknown>; expectRows?: number };

export type PurgePlan = {
  rejected_before?: string;
  withdrawn_before?: string;
  removed_before?: string;
  closed_feedback_before?: string;
  audit_before?: string;
};

export type PurgeCounts = {
  rejected_bark_outs: number;
  withdrawn_bark_outs: number;
  removed_bark_outs: number;
  closed_feedback: number;
  audit_events: number;
};

export interface EngagementDb {
  select<T>(table: EngagementTable, query?: DbQuery): Promise<{ rows: T[]; total: number | null }>;
  commit(ops: DbOp[]): Promise<Record<string, unknown>[][]>;
  purge(plan: PurgePlan, audit: Record<string, unknown>): Promise<PurgeCounts>;
  tableStatus(): Promise<Record<EngagementTable, boolean>>;
}
