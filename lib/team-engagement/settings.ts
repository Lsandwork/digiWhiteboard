import {
  BARK_OUT_MESSAGE_MAX,
  DEFAULT_AI_POLICY,
  DEFAULT_BARK_OUT_CATEGORIES,
  DEFAULT_FEATURES,
  DEFAULT_PARTICIPATION,
  DEFAULT_RETENTION,
  FEATURE_KEYS,
  MIN_AUDIT_RETENTION_DAYS,
  type AiPolicySettings,
  type BarkOutCategory,
  type FeatureSettings,
  type ParticipationSettings,
  type RetentionSettings
} from "@/lib/team-engagement/constants";
import { EngagementError, validationError } from "@/lib/team-engagement/errors";
import type { EngagementDb, SettingKey, SettingRow } from "@/lib/team-engagement/types";

export type EngagementSettings = {
  categories: BarkOutCategory[];
  participation: ParticipationSettings;
  aiPolicy: AiPolicySettings;
  features: FeatureSettings;
  retention: RetentionSettings;
  revisions: Record<SettingKey, number>;
  updated: Partial<Record<SettingKey, { at: string; by: string | null }>>;
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const CATEGORY_KEY = /^[a-z][a-z0-9_]{1,40}$/;

export function normalizeCategories(value: unknown, strict = false): BarkOutCategory[] {
  if (!Array.isArray(value)) {
    if (strict) throw validationError("Categories must be a list.");
    return DEFAULT_BARK_OUT_CATEGORIES;
  }
  const seen = new Set<string>();
  const categories: BarkOutCategory[] = [];
  for (const raw of value) {
    const entry = (raw ?? {}) as Partial<BarkOutCategory>;
    const key = String(entry.key ?? "").trim();
    const label = String(entry.label ?? "").trim().slice(0, 60);
    const description = String(entry.description ?? "").trim().slice(0, 160);
    if (!CATEGORY_KEY.test(key) || !label) {
      if (strict) throw validationError("Each category needs a short key (lowercase letters and underscores) and a label.");
      continue;
    }
    if (seen.has(key)) {
      if (strict) throw validationError(`The category key “${key}” is used twice.`);
      continue;
    }
    seen.add(key);
    categories.push({ key, label, description, active: entry.active !== false });
  }
  if (strict && categories.filter((category) => category.active).length === 0) {
    throw validationError("Keep at least one Bark Out category active.");
  }
  if (strict && categories.length > 30) throw validationError("Use 30 categories or fewer.");
  return categories.length ? categories : DEFAULT_BARK_OUT_CATEGORIES;
}

export function normalizeParticipation(value: unknown): ParticipationSettings {
  const raw = (value ?? {}) as Partial<ParticipationSettings>;
  return {
    dailyLimit: clampInt(raw.dailyLimit, 1, 50, DEFAULT_PARTICIPATION.dailyLimit),
    perRecipientWeeklyLimit: clampInt(raw.perRecipientWeeklyLimit, 1, 20, DEFAULT_PARTICIPATION.perRecipientWeeklyLimit),
    minMessageLength: clampInt(raw.minMessageLength, 10, Math.min(200, BARK_OUT_MESSAGE_MAX), DEFAULT_PARTICIPATION.minMessageLength),
    allowCrossDepartment: raw.allowCrossDepartment !== false,
    hideAfterReports: clampInt(raw.hideAfterReports, 1, 20, DEFAULT_PARTICIPATION.hideAfterReports)
  };
}

export function normalizeAiPolicy(value: unknown): AiPolicySettings {
  const raw = (value ?? {}) as Partial<AiPolicySettings>;
  return {
    enabled: raw.enabled !== false,
    autoApproveThreshold: clampNumber(raw.autoApproveThreshold, 0.6, 0.99, DEFAULT_AI_POLICY.autoApproveThreshold),
    reviewEveryBarkOut: raw.reviewEveryBarkOut === true
  };
}

export function normalizeFeatures(value: unknown): FeatureSettings {
  const raw = (value ?? {}) as Partial<FeatureSettings>;
  const features = { ...DEFAULT_FEATURES };
  for (const key of FEATURE_KEYS) {
    if (typeof raw[key] === "boolean") features[key] = raw[key] as boolean;
  }
  if (!features.bark_outs) {
    features.reactions = false;
    features.concern_reports = false;
  }
  return features;
}

export function normalizeRetention(value: unknown): RetentionSettings {
  const raw = (value ?? {}) as Partial<RetentionSettings>;
  return {
    rejectedBarkOutDays: clampInt(raw.rejectedBarkOutDays, 30, 3650, DEFAULT_RETENTION.rejectedBarkOutDays),
    withdrawnBarkOutDays: clampInt(raw.withdrawnBarkOutDays, 30, 3650, DEFAULT_RETENTION.withdrawnBarkOutDays),
    removedBarkOutDays: clampInt(raw.removedBarkOutDays, 90, 3650, DEFAULT_RETENTION.removedBarkOutDays),
    closedFeedbackDays: clampInt(raw.closedFeedbackDays, 90, 3650, DEFAULT_RETENTION.closedFeedbackDays),
    auditDays: clampInt(raw.auditDays, MIN_AUDIT_RETENTION_DAYS, 3650, DEFAULT_RETENTION.auditDays)
  };
}

export function defaultSettings(): EngagementSettings {
  return {
    categories: DEFAULT_BARK_OUT_CATEGORIES,
    participation: DEFAULT_PARTICIPATION,
    aiPolicy: DEFAULT_AI_POLICY,
    features: DEFAULT_FEATURES,
    retention: DEFAULT_RETENTION,
    revisions: { categories: 0, participation: 0, ai_policy: 0, features: 0, retention: 0 },
    updated: {}
  };
}

export async function loadEngagementSettings(db: EngagementDb): Promise<EngagementSettings> {
  const settings = defaultSettings();
  let rows: SettingRow[];
  try {
    rows = (await db.select<SettingRow>("team_engagement_settings")).rows;
  } catch (error) {
    if (error instanceof EngagementError && error.code === "setup_required") return settings;
    throw error;
  }
  for (const row of rows) {
    settings.revisions[row.setting_key] = row.revision;
    settings.updated[row.setting_key] = { at: row.updated_at, by: row.updated_by_name };
    switch (row.setting_key) {
      case "categories":
        settings.categories = normalizeCategories(row.value);
        break;
      case "participation":
        settings.participation = normalizeParticipation(row.value);
        break;
      case "ai_policy":
        settings.aiPolicy = normalizeAiPolicy(row.value);
        break;
      case "features":
        settings.features = normalizeFeatures(row.value);
        break;
      case "retention":
        settings.retention = normalizeRetention(row.value);
        break;
    }
  }
  return settings;
}

export function settingValue(settings: EngagementSettings, key: SettingKey): unknown {
  switch (key) {
    case "categories":
      return settings.categories;
    case "participation":
      return settings.participation;
    case "ai_policy":
      return settings.aiPolicy;
    case "features":
      return settings.features;
    case "retention":
      return settings.retention;
  }
}
