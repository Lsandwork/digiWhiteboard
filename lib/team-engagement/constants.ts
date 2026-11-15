import type { DepartmentKey } from "@/lib/admin/permissions";

export const TEAM_ENGAGEMENT_MIGRATION = "supabase/migrations/103_team_engagement.sql";
export const PACK_PRIORITY2_MIGRATION = "supabase/migrations/105_pack_priority2.sql";
export const PACK_PRIORITY2_COMMIT = "supabase/migrations/106_team_engagement_commit_pack_tables.sql";
export const PACK_PRIORITY3_MIGRATION = "supabase/migrations/107_pack_priority3.sql";
export const PACK_PHASE4_MIGRATION = "supabase/migrations/109_pack_phase4.sql";
export const PACK_PHASE4_COMMIT = "supabase/migrations/110_team_engagement_commit_phase4.sql";
export const TEMPLATE_LIBRARY_MIGRATION = "supabase/migrations/111_team_engagement_templates.sql";
export const TEMPLATE_LIBRARY_COMMIT = "supabase/migrations/112_team_engagement_commit_templates.sql";
export const FUN_QUESTION_CHOICES_MIGRATION = "supabase/migrations/114_team_engagement_fun_question_choices.sql";
export const FUN_QUESTION_CHOICES_COMMIT = "supabase/migrations/115_team_engagement_commit_fun_question_choices.sql";

export const PACK_GOAL_TYPES = ["numeric", "completion", "participation", "milestone", "timebound"] as const;
export type PackGoalType = (typeof PACK_GOAL_TYPES)[number];

export const PACK_GOAL_STATUSES = ["draft", "active", "completed", "archived"] as const;
export type PackGoalStatus = (typeof PACK_GOAL_STATUSES)[number];

export const VOICE_SURVEY_STATUSES = ["draft", "scheduled", "active", "closed", "archived"] as const;
export type VoiceSurveyStatus = (typeof VOICE_SURVEY_STATUSES)[number];

export const VOICE_QUESTION_TYPES = ["single", "multi", "rating", "yes_no", "text"] as const;
export type VoiceQuestionType = (typeof VOICE_QUESTION_TYPES)[number];

export const SPOTLIGHT_CATEGORIES = [
  "above_and_beyond",
  "behind_the_scenes",
  "team_player",
  "problem_solver",
  "quiet_achiever",
  "made_someones_day"
] as const;
export type SpotlightCategory = (typeof SPOTLIGHT_CATEGORIES)[number];
export const SPOTLIGHT_CATEGORY_LABELS: Record<SpotlightCategory, string> = {
  above_and_beyond: "Above & Beyond",
  behind_the_scenes: "Behind-the-Scenes Hero",
  team_player: "Ultimate Team Player",
  problem_solver: "Problem Solver",
  quiet_achiever: "Quiet Achiever",
  made_someones_day: "Made Someone's Day"
};

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
  { key: "above_and_beyond", label: "Going Above & Beyond", description: "Went past what the shift asked for.", active: true },
  { key: "teamwork", label: "Teamwork", description: "Made the team stronger together.", active: true },
  { key: "dog_care", label: "Amazing Dog Care", description: "Exceptional care for the dogs in our pack.", active: true },
  { key: "problem_solving", label: "Problem Solving", description: "Found a fix when something went sideways.", active: true },
  { key: "initiative", label: "Taking Initiative", description: "Saw what needed doing and jumped in.", active: true },
  { key: "positive_attitude", label: "Positive Attitude", description: "Kept the energy calm and upbeat.", active: true },
  { key: "helping_coworker", label: "Helping a Teammate", description: "Stepped in to support a teammate.", active: true },
  { key: "leadership", label: "Leadership", description: "Led by example on the floor.", active: true },
  { key: "customer_service", label: "Customer Appreciation", description: "Made a pet parent's day easier.", active: true },
  { key: "positive_contribution", label: "Other", description: "Made Fitdog better in a way worth naming.", active: true },
  { key: "reliability", label: "Reliability", description: "Showed up and followed through.", active: true },
  { key: "cross_department", label: "Supporting Another Department", description: "Helped a team outside their own.", active: true }
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
  kudos: "Amazing",
  thanks: "Appreciation",
  celebrate: "Support"
};

export const BARK_OUT_REACTION_EMOJI: Record<BarkOutReaction, string> = {
  kudos: "⭐",
  thanks: "❤️",
  celebrate: "🙌"
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

export const FEEDBACK_STATUSES = [
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "in_progress",
  "implemented",
  "declined",
  "not_moving_forward",
  "planned",
  "resolved"
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  needs_information: "More information needed",
  approved: "Approved",
  in_progress: "In progress",
  implemented: "Implemented",
  declined: "Not moving forward",
  not_moving_forward: "Not moving forward",
  planned: "Planned",
  resolved: "Resolved"
};

export const BARK_OUT_COMMENT_MAX = 500;
export const MILESTONE_MESSAGE_MAX = 400;

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
