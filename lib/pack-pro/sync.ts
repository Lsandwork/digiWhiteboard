import { createHash } from "node:crypto";
import { fetchPackProTrainingProgress } from "@/lib/pack-pro/client";
import { packProCredentialsConfigured, packProSyncEnabled } from "@/lib/pack-pro/config";
import { PACK_PRO_REQUIRED_COURSES } from "@/lib/pack-pro/courses";
import { notifyPackProIncompleteTraining } from "@/lib/pack-pro/notifications";
import {
  buildPackProSummary,
  loadPackProTrainingState,
  savePackProTrainingState
} from "@/lib/pack-pro/store";
import type { PackProCourseProgress, PackProLearnerRow, PackProSyncRun } from "@/lib/pack-pro/types";
import { listAdminUsers } from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function newId() {
  return createHash("sha1").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 16);
}

function courseStatus(percent: number): PackProCourseProgress["status"] {
  if (percent >= 100) return "completed";
  if (percent <= 0) return "not_started";
  return "in_progress";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildLearnerRows(
  raw: Awaited<ReturnType<typeof fetchPackProTrainingProgress>>["learners"],
  adminByEmail: Map<string, string>,
  syncedAt: string
): PackProLearnerRow[] {
  const requiredCount = PACK_PRO_REQUIRED_COURSES.length;
  return raw.map((learner) => {
    const courses: PackProCourseProgress[] = learner.courses.map((course) => {
      const meta = PACK_PRO_REQUIRED_COURSES.find((item) => item.id === course.course_id)!;
      return {
        course_id: course.course_id,
        course_slug: meta.slug,
        course_title: meta.title,
        percent: course.percent,
        status: courseStatus(course.percent)
      };
    });
    const completedCount = courses.filter((course) => course.percent >= 100).length;
    const overallPercent = Math.round(
      courses.reduce((sum, course) => sum + course.percent, 0) / Math.max(1, courses.length)
    );
    const incompleteCourses = courses
      .filter((course) => course.percent < 100)
      .map((course) => course.course_title);
    const email = normalizeEmail(learner.email);
    return {
      id: createHash("sha1").update(email).digest("hex").slice(0, 16),
      name: learner.name,
      email,
      admin_user_id: adminByEmail.get(email) ?? null,
      courses,
      completed_count: completedCount,
      required_count: requiredCount,
      overall_percent: overallPercent,
      is_complete: incompleteCourses.length === 0,
      incomplete_courses: incompleteCourses,
      last_synced_at: syncedAt
    };
  });
}

export async function runPackProTrainingSync(
  supabase: SupabaseClient,
  options: { trigger: "manual" | "cron"; actor?: string | null; force?: boolean } = {
    trigger: "manual"
  }
) {
  if (!options.force && !packProSyncEnabled()) {
    return { skipped: true as const, reason: "disabled" };
  }
  if (!packProCredentialsConfigured()) {
    throw new Error("Pack Pro credentials are not configured.");
  }

  const startedAt = new Date().toISOString();
  const runId = newId();
  const state = await loadPackProTrainingState(supabase);
  const running: PackProSyncRun = {
    id: runId,
    started_at: startedAt,
    finished_at: null,
    trigger: options.trigger,
    status: "running",
    learner_count: 0,
    incomplete_count: 0,
    error: null,
    actor: options.actor ?? null
  };
  state.sync_runs = [running, ...state.sync_runs];
  await savePackProTrainingState(supabase, state);

  try {
    const pulled = await fetchPackProTrainingProgress();
    const admins = await listAdminUsers(supabase);
    const adminByEmail = new Map(
      admins.map((user) => [normalizeEmail(user.email), user.id] as const)
    );
    const syncedAt = new Date().toISOString();
    const learners = buildLearnerRows(pulled.learners, adminByEmail, syncedAt);
    const incompleteCount = learners.filter((row) => !row.is_complete).length;

    const nextState = await loadPackProTrainingState(supabase);
    nextState.learners = learners;
    nextState.group_id = pulled.groupId;
    nextState.last_synced_at = syncedAt;
    nextState.sync_runs = nextState.sync_runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            finished_at: syncedAt,
            status: "success",
            learner_count: learners.length,
            incomplete_count: incompleteCount,
            error: null
          }
        : run
    );
    await savePackProTrainingState(supabase, nextState);

    const alertResult = await notifyPackProIncompleteTraining(supabase, learners, {
      actor: options.actor ?? (options.trigger === "cron" ? "pack-pro-cron" : "pack-pro-sync")
    });

    return {
      skipped: false as const,
      run: nextState.sync_runs.find((run) => run.id === runId)!,
      summary: buildPackProSummary(learners, syncedAt),
      alert: alertResult
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    const nextState = await loadPackProTrainingState(supabase);
    nextState.sync_runs = nextState.sync_runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            finished_at: failedAt,
            status: "error",
            error: message
          }
        : run
    );
    await savePackProTrainingState(supabase, nextState);
    throw error;
  }
}
