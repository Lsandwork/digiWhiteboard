import type { DepartmentKey } from "@/lib/admin/permissions";

export const TEAM_ENGAGEMENT_MIGRATION = "supabase/migrations/103_team_engagement.sql";

export const ENGAGEMENT_DEPARTMENTS: DepartmentKey[] = [
  "front_desk",
  "daycare",
  "grooming",
  "training",
  "transportation",
  "overnight",
  "maintenance",
  "management",
  "admin"
];

/** Departments a manager can be assigned to lead. Leadership groups are org-wide only. */
export const OPERATIONAL_DEPARTMENTS: DepartmentKey[] = [
  "front_desk",
  "daycare",
  "grooming",
  "training",
  "transportation",
  "overnight",
  "maintenance"
];

export const ENGAGEMENT_DEPARTMENT_LABELS: Record<DepartmentKey, string> = {
  front_desk: "Front Desk",
  daycare: "Dog Handlers",
  grooming: "Grooming",
  training: "Training",
  transportation: "Transportation",
  overnight: "Overnight",
  maintenance: "Maintenance",
  management: "Management",
  admin: "Admin"
};

export function departmentLabel(key: string | null | undefined): string {
  if (!key) return "Unassigned";
  return ENGAGEMENT_DEPARTMENT_LABELS[key as DepartmentKey] ?? key;
}

export function isEngagementDepartment(value: unknown): value is DepartmentKey {
  return typeof value === "string" && (ENGAGEMENT_DEPARTMENTS as string[]).includes(value);
}

export type BarkOutCategory = {
  key: string;
  label: string;
  description: string;
  active: boolean;
};

export const DEFAULT_BARK_OUT_CATEGORIES: BarkOutCategory[] = [
  { key: "above_and_beyond", label: "Above and beyond", description: "Went past what the shift asked for.", active: true },
  { key: "helping_coworker", label: "Helping a coworker", description: "Stepped in to support a teammate.", active: true },
  { key: "teamwork", label: "Teamwork", description: "Made the team stronger together.", active: true },
  { key: "positive_attitude", label: "Positive attitude", description: "Kept the energy calm and upbeat.", active: true },
  { key: "customer_service", label: "Customer service", description: "Made a pet parent's day easier.", active: true },
  { key: "reliability", label: "Reliability", description: "Showed up and followed through.", active: true },
  { key: "problem_solving", label: "Problem-solving", description: "Found a fix when something went sideways.", active: true },
  { key: "cross_department", label: "Supporting another department", description: "Helped a team outside their own.", active: true },
  { key: "positive_contribution", label: "Positive contribution", description: "Made Fitdog better in a way worth naming.", active: true }
];

export const BARK_OUT_STATUSES = [
  "awaiting_confirmation",
  "pending_review",
  "published",
  "rejected",
  "removed",
  "withdrawn"
] as const;
export type BarkOutStatus = (typeof BARK_OUT_STATUSES)[number];

export const BARK_OUT_STATUS_LABELS: Record<BarkOutStatus, string> = {
  awaiting_confirmation: "Waiting for your confirmation",
  pending_review: "Waiting for review",
  published: "Posted",
  rejected: "Not posted",
  removed: "Removed",
  withdrawn: "Withdrawn"
};

export const MODERATION_OUTCOMES = [
  "ai_approved",
  "author_confirmation",
  "human_review",
  "policy_rejected",
  "moderator_approved",
  "moderator_rejected",
  "moderator_removed",
  "author_withdrawn",
  "hidden_after_reports"
] as const;
export type ModerationOutcome = (typeof MODERATION_OUTCOMES)[number];

export const MODERATION_REASON_CODES = [
  "self_recognition",
  "personal_information",
  "harassment",
  "discrimination",
  "threat",
  "bullying",
  "personal_attack",
  "retaliation",
  "backhanded_praise",
  "not_recognition",
  "sensitive_topic",
  "duplicate",
  "other"
] as const;
export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];

export const MODERATION_REASON_LABELS: Record<ModerationReasonCode, string> = {
  self_recognition: "Self-recognition",
  personal_information: "Personal information",
  harassment: "Harassment",
  discrimination: "Discrimination",
  threat: "Threat",
  bullying: "Bullying",
  personal_attack: "Personal attack",
  retaliation: "Retaliation",
  backhanded_praise: "Criticism framed as praise",
  not_recognition: "Not recognition",
  sensitive_topic: "Sensitive topic",
  duplicate: "Duplicate",
  other: "Other"
};

export const BARK_OUT_REACTIONS = ["kudos", "thanks", "celebrate"] as const;
export type BarkOutReaction = (typeof BARK_OUT_REACTIONS)[number];
export const BARK_OUT_REACTION_LABELS: Record<BarkOutReaction, string> = {
  kudos: "Kudos",
  thanks: "Thank you",
  celebrate: "Celebrate"
};

export const DEVELOPMENT_RECORD_TYPES = [
  "skill",
  "milestone",
  "training",
  "goal",
  "achievement",
  "growth_note",
  "follow_up"
] as const;
export type DevelopmentRecordType = (typeof DEVELOPMENT_RECORD_TYPES)[number];
export const DEVELOPMENT_RECORD_TYPE_LABELS: Record<DevelopmentRecordType, string> = {
  skill: "Skill",
  milestone: "Training milestone",
  training: "Completed training",
  goal: "Development goal",
  achievement: "Achievement",
  growth_note: "Growth note",
  follow_up: "Manager follow-up"
};

export const DEVELOPMENT_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number];
export const DEVELOPMENT_STATUS_LABELS: Record<DevelopmentStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const DEVELOPMENT_VISIBILITIES = ["leadership", "shared_with_employee"] as const;
export type DevelopmentVisibility = (typeof DEVELOPMENT_VISIBILITIES)[number];

export const FEEDBACK_CATEGORIES = [
  "operations",
  "safety",
  "scheduling",
  "training",
  "equipment",
  "team_culture",
  "customer_experience",
  "other"
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  operations: "Operations",
  safety: "Safety",
  scheduling: "Scheduling",
  training: "Training",
  equipment: "Equipment & supplies",
  team_culture: "Team culture",
  customer_experience: "Customer experience",
  other: "Other"
};

export const FEEDBACK_STATUSES = ["submitted", "under_review", "planned", "resolved", "declined"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  planned: "Planned",
  resolved: "Resolved",
  declined: "Not moving forward"
};

export const PROGRAM_TYPES = [
  "employee_of_the_month",
  "team_achievement",
  "milestone",
  "cross_department",
  "outstanding_teamwork",
  "training_achievement",
  "positive_contribution"
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];
export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  employee_of_the_month: "Employee of the Month",
  team_achievement: "Team Achievement",
  milestone: "Milestone Recognition",
  cross_department: "Cross-Department Recognition",
  outstanding_teamwork: "Outstanding Teamwork",
  training_achievement: "Training Achievement",
  positive_contribution: "Positive Contribution"
};

export const PROGRAM_CADENCES = ["monthly", "quarterly", "annual", "ongoing"] as const;
export type ProgramCadence = (typeof PROGRAM_CADENCES)[number];
export const PROGRAM_STATUSES = ["active", "paused", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const NOMINATION_STATUSES = ["submitted", "under_review", "selected", "not_selected", "withdrawn"] as const;
export type NominationStatus = (typeof NOMINATION_STATUSES)[number];
export const NOMINATION_STATUS_LABELS: Record<NominationStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  selected: "Selected",
  not_selected: "Not selected",
  withdrawn: "Withdrawn"
};

export const AUDIT_CATEGORIES = ["engagement", "moderation", "configuration", "access", "security", "export"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const FEATURE_KEYS = [
  "bark_outs",
  "reactions",
  "concern_reports",
  "feedback",
  "announcements",
  "programs",
  "development"
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  bark_outs: "Bark Outs",
  reactions: "Bark Out reactions",
  concern_reports: "Employee concern reports on Bark Outs",
  feedback: "Feedback & suggestions",
  announcements: "Team announcements",
  programs: "Recognition programs & nominations",
  development: "Employee development records"
};

export type FeatureSettings = Record<FeatureKey, boolean>;
export const DEFAULT_FEATURES: FeatureSettings = {
  bark_outs: true,
  reactions: true,
  concern_reports: true,
  feedback: true,
  announcements: true,
  programs: true,
  development: true
};

export type ParticipationSettings = {
  dailyLimit: number;
  perRecipientWeeklyLimit: number;
  minMessageLength: number;
  allowCrossDepartment: boolean;
  hideAfterReports: number;
};
export const DEFAULT_PARTICIPATION: ParticipationSettings = {
  dailyLimit: 10,
  perRecipientWeeklyLimit: 3,
  minMessageLength: 20,
  allowCrossDepartment: true,
  hideAfterReports: 3
};

export type AiPolicySettings = {
  enabled: boolean;
  autoApproveThreshold: number;
  reviewEveryBarkOut: boolean;
};
export const DEFAULT_AI_POLICY: AiPolicySettings = {
  enabled: true,
  autoApproveThreshold: 0.85,
  reviewEveryBarkOut: false
};

export type RetentionSettings = {
  rejectedBarkOutDays: number;
  withdrawnBarkOutDays: number;
  removedBarkOutDays: number;
  closedFeedbackDays: number;
  auditDays: number;
};
export const DEFAULT_RETENTION: RetentionSettings = {
  rejectedBarkOutDays: 180,
  withdrawnBarkOutDays: 90,
  removedBarkOutDays: 365,
  closedFeedbackDays: 730,
  auditDays: 1095
};
export const MIN_AUDIT_RETENTION_DAYS = 365;

export const BARK_OUT_MESSAGE_MAX = 600;
export const BARK_OUT_CONTEXT_MAX = 200;
export const RECENT_RECOGNITION_DAYS = 30;
