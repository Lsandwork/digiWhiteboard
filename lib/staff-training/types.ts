import type { AdminTab } from "@/lib/admin/types";

export type TrainingCourseSlug = "front_desk" | "overnight";

export type TrainingNarrationStatus = "pending_human" | "recorded";
export type TrainingVideoStatus = "pending_capture" | "ready";

export type TrainingGuidedStep = {
  title: string;
  body: string;
  /** Deep link into the live panel when safe to open alongside the lesson. */
  adminTab?: AdminTab;
  highlight?: string;
};

export type TrainingQuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type TrainingLessonDef = {
  slug: string;
  title: string;
  summary: string;
  section: string;
  order: number;
  durationMinutes: number;
  videoSrc: string | null;
  captionsVtt: string | null;
  videoStatus: TrainingVideoStatus;
  narrationStatus: TrainingNarrationStatus;
  /** Production voiceover script (exact spoken words). */
  narrationScript: string;
  guidedSteps: TrainingGuidedStep[];
  quiz?: TrainingQuizQuestion[];
  /** Flags workflows we could not verify for this role — surfaced in UI. */
  verificationNotes?: string[];
};

export type TrainingCourseDef = {
  slug: TrainingCourseSlug;
  title: string;
  description: string;
  audienceRoleKeys: string[];
  lessons: TrainingLessonDef[];
};

export type LessonProgressRow = {
  courseSlug: string;
  lessonSlug: string;
  videoPositionSeconds: number;
  completedAt: string | null;
  quizPassedAt: string | null;
  quizScore: number | null;
  quizAttempts: number;
  updatedAt: string;
};