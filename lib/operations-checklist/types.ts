export const OPERATIONS_CHECKLIST_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "needs_attention",
  "blocked",
  "not_applicable"
] as const;

export type OperationsChecklistStatus = (typeof OPERATIONS_CHECKLIST_STATUSES)[number];

export const OPERATIONS_CHECKLIST_STATUS_LABELS: Record<OperationsChecklistStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  needs_attention: "Needs Attention",
  blocked: "Blocked",
  not_applicable: "Not Applicable"
};

export const OPERATIONS_CHECKLIST_ROLES = [
  "overnight",
  "opening_team",
  "team_lead",
  "front_desk",
  "handler",
  "groomer",
  "trainer",
  "transportation",
  "management",
  "all_staff"
] as const;

export type OperationsChecklistRole = (typeof OPERATIONS_CHECKLIST_ROLES)[number];

export const OPERATIONS_CHECKLIST_ROLE_LABELS: Record<OperationsChecklistRole, string> = {
  overnight: "Overnight Team",
  opening_team: "Opening Team",
  team_lead: "Team Lead",
  front_desk: "Front Desk",
  handler: "Handlers",
  groomer: "Groomers",
  trainer: "Trainers",
  transportation: "Transportation",
  management: "Management",
  all_staff: "All Staff"
};

export type OperationsChecklistSectionKey =
  | "opening_crossover"
  | "morning_dog_care"
  | "check_in_flow"
  | "yard_operations"
  | "walks_and_services"
  | "midday_operations"
  | "grooming_flow"
  | "training_flow"
  | "transportation_flow"
  | "checkout_flow"
  | "incidents_vet_followup"
  | "afternoon_crossover"
  | "closing_operations";

export type OperationsChecklistTemplateSeed = {
  catalog_key: string;
  section_key: OperationsChecklistSectionKey;
  section_label: string;
  section_sort: number;
  title: string;
  assigned_role: OperationsChecklistRole;
  due_time: string | null;
  sort_order: number;
  is_recurring: boolean;
  requires_photo: boolean;
  requires_management_approval: boolean;
};

export type OperationsChecklistTemplate = OperationsChecklistTemplateSeed & {
  id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OperationsChecklistInstance = {
  id: string;
  template_id: string;
  shift_date: string;
  catalog_key: string;
  section_key: OperationsChecklistSectionKey;
  section_label: string;
  section_sort: number;
  title: string;
  assigned_role: OperationsChecklistRole;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  due_time: string | null;
  sort_order: number;
  status: OperationsChecklistStatus;
  notes: string | null;
  problem_note: string | null;
  help_requested: boolean;
  requires_photo: boolean;
  requires_management_approval: boolean;
  photo_url: string | null;
  completed_by_user_id: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  started_by_user_id: string | null;
  started_by_name: string | null;
  started_at: string | null;
  returned_by_user_id: string | null;
  returned_by_name: string | null;
  returned_at: string | null;
  return_reason: string | null;
  pushed_to_staff_board: boolean;
  pushed_to_staff_board_at: string | null;
  acknowledgment_required: boolean;
  acknowledged_at: string | null;
  acknowledged_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationsChecklistEvent = {
  id: string;
  instance_id: string;
  shift_date: string;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  from_status: OperationsChecklistStatus | null;
  to_status: OperationsChecklistStatus | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OperationsChecklistDayMeta = {
  shift_date: string;
  shift_label: string;
  manager_on_duty_user_id: string | null;
  manager_on_duty_name: string | null;
  clocked_in_names: string[];
  crossover_notes: string | null;
  previous_crossover_notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type OperationsChecklistHeaderStats = {
  shift_date: string;
  shift_label: string;
  current_date_label: string;
  manager_on_duty: string | null;
  clocked_in: string[];
  completion_percent: number;
  completed_count: number;
  total_count: number;
  open_alerts: number;
  open_incidents: number;
  open_vet_visits: number;
  open_owner_follow_ups: number;
  previous_crossover_notes: string | null;
};

export type OperationsChecklistMyTaskBucket =
  | "assigned_to_me"
  | "assigned_to_role"
  | "due_soon"
  | "overdue"
  | "returned"
  | "needs_ack";

export type OperationsChecklistItemView = OperationsChecklistInstance & {
  role_match: boolean;
  overdue: boolean;
  due_soon: boolean;
  my_task_buckets: OperationsChecklistMyTaskBucket[];
};

export type OperationsChecklistSectionView = {
  section_key: OperationsChecklistSectionKey;
  section_label: string;
  section_sort: number;
  completion_percent: number;
  items: OperationsChecklistItemView[];
};

export type OperationsChecklistPermissions = {
  canView: boolean;
  canUpdateTasks: boolean;
  canManage: boolean;
  canExport: boolean;
};

export type OperationsChecklistCompletionStats = {
  by_employee: Array<{ name: string; completed: number; total: number }>;
  by_role: Array<{ role: OperationsChecklistRole; label: string; completed: number; total: number }>;
  missed: OperationsChecklistItemView[];
  overdue: OperationsChecklistItemView[];
  returned: OperationsChecklistItemView[];
  recurring_failures: Array<{ catalog_key: string; title: string; failure_count: number }>;
};

export type OperationsChecklistPayload = {
  header: OperationsChecklistHeaderStats;
  day_meta: OperationsChecklistDayMeta;
  my_tasks: OperationsChecklistItemView[];
  sections: OperationsChecklistSectionView[];
  permissions: OperationsChecklistPermissions;
  assignable_users: Array<{ id: string; name: string; email: string; role: string }>;
  completion_stats: OperationsChecklistCompletionStats | null;
  timezone: string;
  server_time: string;
};
