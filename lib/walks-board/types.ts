export const WALK_BOARD_TYPES = ["no_plays", "groomed", "break_dog"] as const;
export type WalkBoardType = (typeof WALK_BOARD_TYPES)[number];

export const WALK_BOARD_STATUSES = ["pending", "completed", "missed"] as const;
export type WalkBoardStatus = (typeof WALK_BOARD_STATUSES)[number];

export const WALK_BOARD_ACTIONS = ["alarm_due", "reminder_sent", "completed", "missed"] as const;
export type WalkBoardAction = (typeof WALK_BOARD_ACTIONS)[number];

export type WalkBoardUrgency = "upcoming" | "due_soon" | "alarm_due" | "overdue" | "completed" | "closed";

export type WalkBoardCycleRow = {
  id: string;
  slot_key: string;
  shift_date: string;
  scheduled_hour: number;
  status: WalkBoardStatus;
  due_at: string;
  completed_at: string | null;
  completed_by: string | null;
  missed_at: string | null;
  push_notice_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WalkBoardActivityRow = {
  id: string;
  walk_cycle_id: string;
  action: WalkBoardAction;
  actor_user_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WalkBoardUserRef = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type WalkBoardCycleView = WalkBoardCycleRow & {
  completed_by_user: WalkBoardUserRef | null;
};

export type WalkBoardActivityView = WalkBoardActivityRow & {
  actor_user: WalkBoardUserRef | null;
};

export type WalkBoardSummary = {
  todayCount: number;
  pendingCount: number;
  completedCount: number;
  overdueCount: number;
  nextDueAt: string | null;
};

export type WalkBoardPermissions = {
  canComplete: boolean;
  canReceiveReminders: boolean;
};

export type WalkBoardPublicState = {
  timezone: "America/Los_Angeles";
  operatingWindow: boolean;
  currentSlotKey: string | null;
  currentCycle: WalkBoardCycleView | null;
  todayCycles: WalkBoardCycleView[];
  summary: WalkBoardSummary;
  permissions: WalkBoardPermissions;
  serverTime: string;
  nextAlarmAt: string;
  title: string;
  message: string;
  checklist: string[];
};
