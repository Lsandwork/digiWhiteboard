export type PackProCourseProgress = {
  course_id: number;
  course_slug: string;
  course_title: string;
  percent: number;
  status: "not_started" | "in_progress" | "completed";
};

export type PackProLearnerRow = {
  id: string;
  name: string;
  email: string;
  admin_user_id: string | null;
  courses: PackProCourseProgress[];
  completed_count: number;
  required_count: number;
  overall_percent: number;
  is_complete: boolean;
  incomplete_courses: string[];
  last_synced_at: string;
};

export type PackProSyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: "manual" | "cron";
  status: "running" | "success" | "error";
  learner_count: number;
  incomplete_count: number;
  error: string | null;
  actor: string | null;
};

export type PackProTrainingState = {
  learners: PackProLearnerRow[];
  sync_runs: PackProSyncRun[];
  last_synced_at: string | null;
  last_alert_at: string | null;
  last_alert_fingerprint: string | null;
  group_id: number | null;
};

export type PackProTrainingSummary = {
  learner_count: number;
  complete_count: number;
  incomplete_count: number;
  not_started_count: number;
  average_percent: number;
  course_completion: Array<{
    course_id: number;
    course_slug: string;
    course_title: string;
    complete_count: number;
    learner_count: number;
    percent: number;
  }>;
  last_synced_at: string | null;
};
