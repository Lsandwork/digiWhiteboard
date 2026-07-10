export const WALK_BOARD_TYPES = ["no_plays", "groomed", "break_dog"] as const;
export type WalkBoardType = (typeof WALK_BOARD_TYPES)[number];

export const WALK_BOARD_STATUSES = ["active", "cleared"] as const;
export type WalkBoardStatus = (typeof WALK_BOARD_STATUSES)[number];

export const WALK_BOARD_ACTIONS = [
  "added",
  "walk_due",
  "reminder_sent",
  "walked",
  "snoozed",
  "cleared"
] as const;
export type WalkBoardAction = (typeof WALK_BOARD_ACTIONS)[number];

export type WalkBoardEntryRow = {
  id: string;
  dog_name: string;
  dog_name_normalized: string;
  walk_type: WalkBoardType;
  status: WalkBoardStatus;
  created_at: string;
  created_by: string | null;
  cycle_started_at: string;
  next_due_at: string;
  last_walked_at: string | null;
  last_walked_by: string | null;
  snooze_used: boolean;
  snoozed_at: string | null;
  snoozed_by: string | null;
  cleared_at: string | null;
  cleared_by: string | null;
  version: number;
  updated_at: string;
};

export type WalkBoardActivityRow = {
  id: string;
  walk_entry_id: string;
  action: WalkBoardAction;
  actor_user_id: string | null;
  occurred_at: string;
  previous_due_at: string | null;
  new_due_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WalkBoardUserRef = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type WalkBoardEntryView = WalkBoardEntryRow & {
  created_by_user: WalkBoardUserRef | null;
  last_walked_by_user: WalkBoardUserRef | null;
  snoozed_by_user: WalkBoardUserRef | null;
  cleared_by_user: WalkBoardUserRef | null;
};

export type WalkBoardActivityView = WalkBoardActivityRow & {
  actor_user: WalkBoardUserRef | null;
};

export type WalkBoardUrgency = "on_track" | "due_soon" | "walk_due" | "overdue" | "snoozed";

export type WalkBoardSummary = {
  activeCount: number;
  dueNowCount: number;
  overdueCount: number;
  nextDueAt: string | null;
};

export type WalkBoardPermissions = {
  canSnooze: boolean;
  canReceiveReminders: boolean;
};
