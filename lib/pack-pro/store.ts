import { PACK_PRO_REQUIRED_COURSES } from "@/lib/pack-pro/courses";
import type {
  PackProLearnerRow,
  PackProSyncRun,
  PackProTrainingState,
  PackProTrainingSummary
} from "@/lib/pack-pro/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const SETTINGS_KEY = "pack_pro_training";

function emptyState(): PackProTrainingState {
  return {
    learners: [],
    sync_runs: [],
    last_synced_at: null,
    last_alert_at: null,
    last_alert_fingerprint: null,
    group_id: null
  };
}

function dedupeLearners(learners: PackProLearnerRow[]): PackProLearnerRow[] {
  const byEmail = new Map<string, PackProLearnerRow>();
  for (const learner of learners) {
    const email = String(learner.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prior = byEmail.get(email);
    if (!prior) {
      byEmail.set(email, { ...learner, email });
      continue;
    }
    const priorTs = Date.parse(prior.last_synced_at || "") || 0;
    const nextTs = Date.parse(learner.last_synced_at || "") || 0;
    byEmail.set(email, nextTs >= priorTs ? { ...learner, id: prior.id, email } : prior);
  }
  return [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function parseState(value: unknown): PackProTrainingState {
  if (!value || typeof value !== "object") return emptyState();
  const raw = value as Partial<PackProTrainingState>;
  return {
    learners: dedupeLearners(Array.isArray(raw.learners) ? (raw.learners as PackProLearnerRow[]) : []),
    sync_runs: Array.isArray(raw.sync_runs) ? (raw.sync_runs as PackProSyncRun[]) : [],
    last_synced_at: typeof raw.last_synced_at === "string" ? raw.last_synced_at : null,
    last_alert_at: typeof raw.last_alert_at === "string" ? raw.last_alert_at : null,
    last_alert_fingerprint:
      typeof raw.last_alert_fingerprint === "string" ? raw.last_alert_fingerprint : null,
    group_id: typeof raw.group_id === "number" ? raw.group_id : null
  };
}

export async function loadPackProTrainingState(supabase: SupabaseClient): Promise<PackProTrainingState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_KEY]);
}

export async function savePackProTrainingState(supabase: SupabaseClient, state: PackProTrainingState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_KEY]: {
      ...state,
      sync_runs: state.sync_runs.slice(0, 30)
    }
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export function buildPackProSummary(learners: PackProLearnerRow[], lastSyncedAt: string | null): PackProTrainingSummary {
  const learnerCount = learners.length;
  const completeCount = learners.filter((row) => row.is_complete).length;
  const incompleteCount = learners.filter((row) => !row.is_complete).length;
  const notStartedCount = learners.filter((row) => row.overall_percent === 0).length;
  const averagePercent =
    learnerCount === 0
      ? 0
      : Math.round(learners.reduce((sum, row) => sum + row.overall_percent, 0) / learnerCount);

  const courseCompletion = PACK_PRO_REQUIRED_COURSES.map((course) => {
    const complete = learners.filter((row) =>
      row.courses.some((item) => item.course_id === course.id && item.percent >= 100)
    ).length;
    return {
      course_id: course.id,
      course_slug: course.slug,
      course_title: course.title,
      complete_count: complete,
      learner_count: learnerCount,
      percent: learnerCount === 0 ? 0 : Math.round((complete / learnerCount) * 100)
    };
  });

  return {
    learner_count: learnerCount,
    complete_count: completeCount,
    incomplete_count: incompleteCount,
    not_started_count: notStartedCount,
    average_percent: averagePercent,
    course_completion: courseCompletion,
    last_synced_at: lastSyncedAt
  };
}
