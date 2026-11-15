export const ENGAGEMENT_TEMPLATE_TABS = [
  "the_pack",
  "bark_outs",
  "milestones",
  "pack_goals",
  "fun_zone",
  "employee_voice",
  "team_pulse",
  "ideas",
  "campaigns",
  "management_comms"
] as const;

export type EngagementTemplateTab = (typeof ENGAGEMENT_TEMPLATE_TABS)[number];

export const ENGAGEMENT_TEMPLATE_TONES = [
  "Warm & Appreciative",
  "Professional",
  "Celebratory",
  "Motivational",
  "Lighthearted",
  "Thoughtful",
  "Encouraging",
  "Constructive"
] as const;

export type EngagementTemplateTone = (typeof ENGAGEMENT_TEMPLATE_TONES)[number];

export const ENGAGEMENT_TEMPLATE_KINDS = [
  "culture_message",
  "announcement",
  "bark_out",
  "question_week",
  "poll",
  "fun_activity",
  "trivia",
  "goal",
  "milestone",
  "voice_question",
  "voice_survey",
  "pulse_survey",
  "insight",
  "idea_prompt",
  "status_message",
  "campaign"
] as const;

export type EngagementTemplateKind = (typeof ENGAGEMENT_TEMPLATE_KINDS)[number];

export type EngagementTemplateSeed = {
  slug: string;
  name: string;
  description: string;
  tab: EngagementTemplateTab;
  category: string;
  tone: EngagementTemplateTone | string;
  titleTemplate: string;
  messageTemplate: string;
  instructionsTemplate?: string | null;
  kind: EngagementTemplateKind;
  placeholderFields?: string[];
  payload?: Record<string, unknown>;
  isSystem?: boolean;
};

export type EngagementTemplateRow = EngagementTemplateSeed & {
  id: string;
  status: "draft" | "active" | "archived";
  isSystem: boolean;
  sourceSlug: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
};

export const TEMPLATE_PLACEHOLDER_PATTERN = /\[(Employee Name|Department|Milestone|Date|Goal|Team Name|Activity|Deadline|Recognition Category|Manager Name)\]/gi;