import { NextResponse } from "next/server";
import {
  STAFF_TRAINING_COURSES,
  courseForRole,
  estimatedCourseMinutes,
  getLesson
} from "@/lib/staff-training/catalog";
import { requireStaffTrainingAccess } from "@/lib/staff-training/http";
import { listTrainingProgress, listTrainingReportForCourse, upsertTrainingProgress } from "@/lib/staff-training/progress";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaffTrainingAccess(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "reports" && gate.canViewReports) {
    const courseSlug = url.searchParams.get("course") || "front_desk";
    const course = STAFF_TRAINING_COURSES.find((c) => c.slug === courseSlug);
    if (!course) return NextResponse.json({ error: "Unknown course." }, { status: 400 });
    try {
      const rows = await listTrainingReportForCourse(gate.supabase!, course.slug, course.lessons.length);
      return NextResponse.json({ ok: true, course: course.slug, rows });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load training reports.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const learnerCourse = courseForRole(gate.role ?? "");
  const courses =
    gate.canViewReports && !learnerCourse
      ? STAFF_TRAINING_COURSES
      : learnerCourse
        ? [learnerCourse]
        : [];

  let progress: Awaited<ReturnType<typeof listTrainingProgress>> = [];
  try {
    progress = await listTrainingProgress(gate.supabase!, gate.adminUserId!);
  } catch {
    progress = [];
  }

  return NextResponse.json({
    ok: true,
    courses: courses.map((course) => ({
      ...course,
      estimatedMinutes: estimatedCourseMinutes(course),
      lessonCount: course.lessons.length
    })),
    progress,
    canViewReports: gate.canViewReports,
    narrationNotice:
      "Final videos require human-recorded narration and approved screen captures. Scripts and guided steps are production-ready; do not use AI text-to-speech for official training."
  });
}

export async function POST(request: Request) {
  const gate = await requireStaffTrainingAccess(request);
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const courseSlug = String(body.courseSlug ?? "");
  const lessonSlug = String(body.lessonSlug ?? "");
  const lesson = getLesson(courseSlug, lessonSlug);
  if (!lesson) return NextResponse.json({ error: "Unknown lesson." }, { status: 400 });

  const learnerCourse = courseForRole(gate.role ?? "");
  if (learnerCourse && learnerCourse.slug !== courseSlug && !gate.canViewReports) {
    return NextResponse.json({ error: "That course is not assigned to your role." }, { status: 403 });
  }

  try {
    if (action === "save_position") {
      const position = Number(body.videoPositionSeconds ?? 0);
      const row = await upsertTrainingProgress(gate.supabase!, {
        adminUserId: gate.adminUserId!,
        courseSlug,
        lessonSlug,
        videoPositionSeconds: Number.isFinite(position) ? position : 0
      });
      return NextResponse.json({ ok: true, progress: row });
    }

    if (action === "mark_complete") {
      const row = await upsertTrainingProgress(gate.supabase!, {
        adminUserId: gate.adminUserId!,
        courseSlug,
        lessonSlug,
        completed: true
      });
      return NextResponse.json({ ok: true, progress: row });
    }

    if (action === "submit_quiz") {
      const answers = body.answers as number[] | undefined;
      if (!lesson.quiz?.length) {
        return NextResponse.json({ error: "This lesson has no quiz." }, { status: 400 });
      }
      if (!Array.isArray(answers) || answers.length !== lesson.quiz.length) {
        return NextResponse.json({ error: "Answer every question." }, { status: 400 });
      }
      let correct = 0;
      lesson.quiz.forEach((q, index) => {
        if (answers[index] === q.correctIndex) correct += 1;
      });
      const score = Math.round((correct / lesson.quiz.length) * 100);
      const passed = score >= 80;
      const row = await upsertTrainingProgress(gate.supabase!, {
        adminUserId: gate.adminUserId!,
        courseSlug,
        lessonSlug,
        quizScore: score,
        quizPassed: passed,
        completed: passed ? true : undefined
      });
      return NextResponse.json({
        ok: true,
        score,
        passed,
        progress: row,
        explanations: lesson.quiz.map((q, index) => ({
          id: q.id,
          correct: answers[index] === q.correctIndex,
          explanation: q.explanation
        }))
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save training progress.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}