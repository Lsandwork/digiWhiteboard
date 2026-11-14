import type { LessonProgressRow } from "@/lib/staff-training/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function mapRow(raw: Record<string, unknown>): LessonProgressRow {
  return {
    courseSlug: String(raw.course_slug),
    lessonSlug: String(raw.lesson_slug),
    videoPositionSeconds: Number(raw.video_position_seconds ?? 0),
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
    quizPassedAt: raw.quiz_passed_at ? String(raw.quiz_passed_at) : null,
    quizScore: raw.quiz_score != null ? Number(raw.quiz_score) : null,
    quizAttempts: Number(raw.quiz_attempts ?? 0),
    updatedAt: String(raw.updated_at ?? new Date().toISOString())
  };
}

export async function listTrainingProgress(
  supabase: SupabaseClient,
  adminUserId: string,
  courseSlug?: string
): Promise<LessonProgressRow[]> {
  let query = supabase.from("staff_training_lesson_progress").select("*").eq("admin_user_id", adminUserId);
  if (courseSlug) query = query.eq("course_slug", courseSlug);
  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function upsertTrainingProgress(
  supabase: SupabaseClient,
  input: {
    adminUserId: string;
    courseSlug: string;
    lessonSlug: string;
    videoPositionSeconds?: number;
    completed?: boolean;
    quizScore?: number;
    quizPassed?: boolean;
  }
): Promise<LessonProgressRow> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    admin_user_id: input.adminUserId,
    course_slug: input.courseSlug,
    lesson_slug: input.lessonSlug,
    updated_at: now
  };
  if (input.videoPositionSeconds != null) patch.video_position_seconds = input.videoPositionSeconds;
  if (input.completed) patch.completed_at = now;
  if (input.quizScore != null) patch.quiz_score = input.quizScore;
  if (input.quizPassed) patch.quiz_passed_at = now;
  if (input.quizScore != null) {
    const { data: existing } = await supabase
      .from("staff_training_lesson_progress")
      .select("quiz_attempts")
      .eq("admin_user_id", input.adminUserId)
      .eq("course_slug", input.courseSlug)
      .eq("lesson_slug", input.lessonSlug)
      .maybeSingle();
    const attempts = Number((existing as { quiz_attempts?: number } | null)?.quiz_attempts ?? 0);
    patch.quiz_attempts = attempts + 1;
  }

  const { data, error } = await supabase
    .from("staff_training_lesson_progress")
    .upsert(patch, { onConflict: "admin_user_id,course_slug,lesson_slug" })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export type TrainingReportRow = {
  adminUserId: string;
  email: string;
  displayName: string;
  role: string;
  courseSlug: string;
  lessonsCompleted: number;
  lessonsTotal: number;
  percentComplete: number;
  lastActivityAt: string | null;
};

export async function listTrainingReportForCourse(
  supabase: SupabaseClient,
  courseSlug: string,
  lessonsTotal: number
): Promise<TrainingReportRow[]> {
  const { data: users, error: usersError } = await supabase
    .from("admin_users")
    .select("id,email,full_name,role")
    .eq("role", courseSlug === "front_desk" ? "front_desk_coordinator" : "overnight");
  if (usersError) throw usersError;

  const { data: progress, error: progressError } = await supabase
    .from("staff_training_lesson_progress")
    .select("admin_user_id,completed_at,updated_at")
    .eq("course_slug", courseSlug)
    .not("completed_at", "is", null);
  if (progressError) {
    if (progressError.code === "42P01") return [];
    throw progressError;
  }

  const completedByUser = new Map<string, { count: number; last: string | null }>();
  for (const row of progress ?? []) {
    const id = String((row as { admin_user_id: string }).admin_user_id);
    const entry = completedByUser.get(id) ?? { count: 0, last: null };
    entry.count += 1;
    const updated = String((row as { updated_at?: string }).updated_at ?? "");
    if (!entry.last || updated > entry.last) entry.last = updated;
    completedByUser.set(id, entry);
  }

  return (users ?? []).map((u) => {
    const id = String((u as { id: string }).id);
    const stat = completedByUser.get(id) ?? { count: 0, last: null };
    const percent = lessonsTotal ? Math.round((stat.count / lessonsTotal) * 100) : 0;
    return {
      adminUserId: id,
      email: String((u as { email?: string }).email ?? ""),
      displayName: String((u as { full_name?: string }).full_name ?? ""),
      role: String((u as { role?: string }).role ?? ""),
      courseSlug,
      lessonsCompleted: stat.count,
      lessonsTotal,
      percentComplete: percent,
      lastActivityAt: stat.last
    };
  });
}