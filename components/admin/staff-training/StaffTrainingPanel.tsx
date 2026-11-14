"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Clapperboard, Mic } from "lucide-react";
import { readResponseJson } from "@/lib/http/read-response-json";
import type { AdminTab } from "@/lib/admin/types";
import type { TrainingCourseDef, TrainingLessonDef, LessonProgressRow } from "@/lib/staff-training/types";
import type { TrainingReportRow } from "@/lib/staff-training/progress";
import "./staff-training.css";

type StaffTrainingPanelProps = {
  onOpenTab?: (tab: AdminTab) => void;
};

type Payload = {
  courses: (TrainingCourseDef & { estimatedMinutes: number; lessonCount: number })[];
  progress: LessonProgressRow[];
  canViewReports: boolean;
  narrationNotice: string;
};

function progressFor(progress: LessonProgressRow[], courseSlug: string, lessonSlug: string) {
  return progress.find((p) => p.courseSlug === courseSlug && p.lessonSlug === lessonSlug) ?? null;
}

export function StaffTrainingPanel({ onOpenTab }: StaffTrainingPanelProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [lessonSlug, setLessonSlug] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<TrainingReportRow[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff-training", { cache: "no-store" });
      const body = await readResponseJson(res);
      if (!res.ok) throw new Error(body.error ?? "Unable to load training.");
      setPayload(body as Payload);
      const courses = (body as Payload).courses;
      if (courses.length) {
        setCourseSlug((prev) => prev ?? courses[0]!.slug);
        setLessonSlug((prev) => prev ?? courses[0]!.lessons[0]?.slug ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load training.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (slug: "front_desk" | "overnight") => {
    try {
      const res = await fetch(`/api/admin/staff-training?view=reports&course=${slug}`, { cache: "no-store" });
      const body = await readResponseJson(res);
      if (!res.ok) throw new Error(body.error ?? "Unable to load report.");
      setReportRows(body.rows ?? []);
    } catch (e) {
      setReportRows([]);
      setError(e instanceof Error ? e.message : "Unable to load report.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const course = useMemo(() => payload?.courses.find((c) => c.slug === courseSlug) ?? null, [payload, courseSlug]);
  const lesson: TrainingLessonDef | null = useMemo(
    () => course?.lessons.find((l) => l.slug === lessonSlug) ?? null,
    [course, lessonSlug]
  );

  const lessonProgress = lesson && course && payload ? progressFor(payload.progress, course.slug, lesson.slug) : null;

  async function postAction(action: string, extra?: Record<string, unknown>) {
    if (!course || !lesson) return;
    const res = await fetch("/api/admin/staff-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, courseSlug: course.slug, lessonSlug: lesson.slug, ...extra })
    });
    const body = await readResponseJson(res);
    if (!res.ok) throw new Error(body.error ?? "Save failed.");
    await load();
    return body;
  }

  async function submitQuiz() {
    if (!lesson?.quiz) return;
    setQuizFeedback(null);
    try {
      const answers = lesson.quiz.map((q) => quizAnswers[q.id] ?? -1);
      const body = await postAction("submit_quiz", { answers });
      if (body.passed) setQuizFeedback(`Passed with ${body.score}%. Lesson marked complete.`);
      else setQuizFeedback(`Score ${body.score}%. Review the explanations and try again (80% required).`);
    } catch (e) {
      setQuizFeedback(e instanceof Error ? e.message : "Quiz save failed.");
    }
  }

  if (loading) return <p className="admin-muted">Loading training center…</p>;
  if (error && !payload) return <p className="admin-error">{error}</p>;
  if (!payload?.courses.length) return <p className="admin-muted">No training course is assigned to your role.</p>;

  const completedCount =
    course?.lessons.filter((l) => progressFor(payload.progress, course.slug, l.slug)?.completedAt).length ?? 0;

  return (
    <div className="staff-training">
      <header className="staff-training-hero">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 h-6 w-6 shrink-0" aria-hidden />
          <div>
            <h2 className="admin-page-title">Staff Training Center</h2>
            <p className="admin-page-subtitle mt-1">
              Official Fitdog tutorials for the real RuffOps panels. Follow along in your own account—pause, perform
              the step, then continue.
            </p>
            <p className="staff-training-notice" role="note">
              <Mic className="inline h-4 w-4 mr-1" aria-hidden />
              {payload.narrationNotice}
            </p>
          </div>
        </div>
      </header>

      {payload.canViewReports ? (
        <section className="staff-training-report">
          <h3 className="admin-section-title">Team completion (management)</h3>
          <div className="flex gap-2 mb-2">
            <button type="button" className="admin-btn-secondary" onClick={() => void loadReport("front_desk")}>
              Front Desk report
            </button>
            <button type="button" className="admin-btn-secondary" onClick={() => void loadReport("overnight")}>
              Overnight report
            </button>
          </div>
          {reportRows ? (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Progress</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.adminUserId}>
                    <td>{row.displayName || "—"}</td>
                    <td>{row.email}</td>
                    <td>
                      {row.lessonsCompleted}/{row.lessonsTotal} ({row.percentComplete}%)
                    </td>
                    <td>{row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-muted text-sm">Load a report to see completion by role.</p>
          )}
        </section>
      ) : null}

      {payload.courses.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {payload.courses.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={courseSlug === c.slug ? "admin-btn" : "admin-btn-secondary"}
              onClick={() => {
                setCourseSlug(c.slug);
                setLessonSlug(c.lessons[0]?.slug ?? null);
              }}
            >
              {c.title}
            </button>
          ))}
        </div>
      ) : null}

      {course ? (
        <>
          <p className="admin-muted text-sm">
            {course.description} · ~{course.lessons.reduce((s, l) => s + l.durationMinutes, 0)} min ·{" "}
            {completedCount}/{course.lessons.length} lessons complete
          </p>

          <div className="staff-training-grid">
            <nav aria-label="Lessons">
              <ul className="staff-training-lesson-list">
                {course.lessons.map((l) => {
                  const done = Boolean(progressFor(payload.progress, course.slug, l.slug)?.completedAt);
                  return (
                    <li key={l.slug}>
                      <button
                        type="button"
                        className={[
                          "staff-training-lesson-btn",
                          lessonSlug === l.slug ? "is-active" : "",
                          done ? "is-done" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setLessonSlug(l.slug);
                          setQuizAnswers({});
                          setQuizFeedback(null);
                        }}
                      >
                        <span className="block font-medium">{l.title}</span>
                        <span className="block text-xs opacity-70">{l.section}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {lesson ? (
              <article className="staff-training-player">
                <h3 className="admin-section-title">{lesson.title}</h3>
                <p className="admin-muted text-sm mb-2">{lesson.summary}</p>

                <div className="staff-training-status-row">
                  <span className="staff-training-pill staff-training-pill--warn">
                    <Clapperboard className="inline h-3.5 w-3.5 mr-1" aria-hidden />
                    Screen capture: {lesson.videoStatus === "ready" ? "ready" : "pending production"}
                  </span>
                  <span className="staff-training-pill staff-training-pill--warn">
                    <Mic className="inline h-3.5 w-3.5 mr-1" aria-hidden />
                    Narration: {lesson.narrationStatus === "recorded" ? "recorded" : "pending human recording"}
                  </span>
                  {lessonProgress?.completedAt ? (
                    <span className="staff-training-pill">
                      <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-green-700" aria-hidden />
                      Completed
                    </span>
                  ) : null}
                </div>

                <div className="staff-training-video-shell">
                  {lesson.videoSrc ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={lesson.videoSrc}
                      onTimeUpdate={(e) => {
                        const el = e.currentTarget;
                        if (Math.floor(el.currentTime) % 15 === 0 && el.currentTime > 0) {
                          void postAction("save_position", { videoPositionSeconds: el.currentTime }).catch(() => undefined);
                        }
                      }}
                    >
                      {lesson.captionsVtt ? <track kind="captions" src={lesson.captionsVtt} label="English" default /> : null}
                    </video>
                  ) : (
                    <div className="p-6 text-center text-sm max-w-md">
                      <p className="mb-2 font-medium">Video slot reserved</p>
                      <p>
                        Screen recording will be uploaded to <code>/public/training/</code> after capture on a sanitized
                        training account. Until then, use the guided steps and voiceover script below with the live app.
                      </p>
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-semibold mt-2">Voiceover script (record exactly as written)</h4>
                <div className="staff-training-script">{lesson.narrationScript}</div>

                {lesson.verificationNotes?.length ? (
                  <div className="staff-training-notice mt-3">
                    <AlertTriangle className="inline h-4 w-4 mr-1" aria-hidden />
                    {lesson.verificationNotes.join(" ")}
                  </div>
                ) : null}

                <h4 className="text-sm font-semibold mt-4">Guided steps (real RuffOps)</h4>
                <ol className="staff-training-steps">
                  {lesson.guidedSteps.map((step) => (
                    <li key={step.title} className="mb-2">
                      <strong>{step.title}.</strong> {step.body}
                      {step.highlight ? <em className="block text-sm opacity-80">{step.highlight}</em> : null}
                      {step.adminTab && onOpenTab ? (
                        <button type="button" className="admin-link-button text-sm mt-1" onClick={() => onOpenTab(step.adminTab!)}>
                          Open this panel now
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button type="button" className="admin-btn" onClick={() => void postAction("mark_complete").catch(() => undefined)}>
                    Mark lesson complete
                  </button>
                </div>

                {lesson.quiz?.length ? (
                  <section className="staff-training-quiz mt-6">
                    <h4 className="text-sm font-semibold">Knowledge check</h4>
                    {lesson.quiz.map((q) => (
                      <fieldset key={q.id} className="mt-3 border-0 p-0">
                        <legend className="text-sm font-medium mb-1">{q.prompt}</legend>
                        {q.choices.map((choice, index) => (
                          <label key={choice}>
                            <input
                              type="radio"
                              name={q.id}
                              checked={quizAnswers[q.id] === index}
                              onChange={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: index }))}
                            />{" "}
                            {choice}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                    <button type="button" className="admin-btn mt-3" onClick={() => void submitQuiz()}>
                      Submit answers
                    </button>
                    {quizFeedback ? <p className="text-sm mt-2">{quizFeedback}</p> : null}
                  </section>
                ) : null}
              </article>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}