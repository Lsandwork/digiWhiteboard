-- Employee training center: courses, lesson progress, quiz attempts.

CREATE TABLE IF NOT EXISTS public.staff_training_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  course_slug text NOT NULL,
  lesson_slug text NOT NULL,
  video_position_seconds numeric(10, 2) NOT NULL DEFAULT 0,
  completed_at timestamptz,
  quiz_passed_at timestamptz,
  quiz_score integer,
  quiz_attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, course_slug, lesson_slug)
);

CREATE INDEX IF NOT EXISTS staff_training_lesson_progress_user_idx
  ON public.staff_training_lesson_progress (admin_user_id);

CREATE INDEX IF NOT EXISTS staff_training_lesson_progress_course_idx
  ON public.staff_training_lesson_progress (course_slug, lesson_slug);

ALTER TABLE public.staff_training_lesson_progress ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.staff_training_lesson_progress IS
  'Per-user lesson completion and resume position for in-app staff training.';