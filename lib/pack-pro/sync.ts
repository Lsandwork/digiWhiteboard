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

export function normalizePackProEmail(value: string) {
  return value.trim().toLowerCase();
}

function learnerIdForEmail(email: string) {
  return createHash("sha1").update(normalizePackProEmail(email)).digest("hex").slice(0, 16);
}

/**
 * Upsert learners by email so every Pack Pro sync updates the same rows in place.
 * Never appends duplicates; learners removed from Pack Pro are dropped.
 */
export function upsertPackProLearnersByEmail(
  previous: PackProLearnerRow[],
  next: PackProLearnerRow[]
): PackProLearnerRow[] {
  const previousByEmail = new Map(
    previous.map((learner) => [normalizePackProEmail(learner.email), learner] as const)
  );
  const merged = new Map<string, PackProLearnerRow>();

  for (const learner of next) {
    const email = normalizePackProEmail(learner.email);
    if (!email) continue;
    const prior = previousByEmail.get(email) ?? merged.get(email);
    const id = prior?.id || learner.id || learnerIdForEmail(email);
    merged.set(email, {
      ...learner,
      id,
      email,
      admin_user_id: learner.admin_user_id ?? prior?.admin_user_id ?? null
    });
  }

  return [...merged.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function buildLearnerRows(
  raw: Awaited<ReturnType<typeof fetchPackProTrainingProgress>>["learners"],
  adminByEmail: Map<string, string>,
  syncedAt: string
): PackProLearnerRow[] {
  const requiredCount = PACK_PRO_REQUIRED_COURSES.length;
  const byEmail = new Map<string, PackProLearnerRow>();

  for (const learner of raw) {
    const email = normalizePackProEmail(learner.email);
    if (!email) continue;

    const courses: PackProCourseProgress[] = PACK_PRO_REQUIRED_COURSES.map((meta) => {
      const found = learner.courses.find((item) => item.course_id === meta.id);
      const percent = found?.percent ?? 0;
      return {
        course_id: meta.id,
        course_slug: meta.slug,
        course_title: meta.title,
        percent,
        status: courseStatus(percent)
      };
    });
    const completedCount = courses.filter((course) => course.percent >= 100).length;
    const overallPercent = Math.round(
      courses.reduce((sum, course) => sum + course.percent, 0) / Math.max(1, courses.length)
    );
    const incompleteCourses = courses
      .filter((course) => course.percent < 100)
      .map((course) => course.course_title);

    byEmail.set(email, {
      id: learnerIdForEmail(email),
      name: learner.name.trim() || email,
      email,
      admin_user_id: adminByEmail.get(email) ?? null,
      courses,
      completed_count: completedCount,
      required_count: requiredCount,
      overall_percent: overallPercent,
      is_complete: incompleteCourses.length === 0,
      incomplete_courses: incompleteCourses,
      last_synced_at: syncedAt
    });
  }

  return [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
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
      admins.map((user) => [normalizePackProEmail(user.email), user.id] as const)
    );
    const syncedAt = new Date().toISOString();
    const pulledLearners = buildLearnerRows(pulled.learners, adminByEmail, syncedAt);
    const nextState = await loadPackProTrainingState(supabase);
    const learners = upsertPackProLearnersByEmail(nextState.learners, pulledLearners);
    const incompleteCount = learners.filter((row) => !row.is_complete).length;

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
