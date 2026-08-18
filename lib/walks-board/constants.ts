export const WALK_BOARD_TIMEZONE = "America/Los_Angeles";

/** Alarm every 2 hours from 8:00 AM through 6:00 PM Pacific (last cycle before 7:00 PM). */
export const WALK_BOARD_ALARM_START_HOUR = 8;
export const WALK_BOARD_ALARM_END_HOUR = 19;
export const WALK_BOARD_ALARM_INTERVAL_HOURS = 2;
export const WALK_BOARD_ALARM_HOURS = [8, 10, 12, 14, 16, 18] as const;

export const WALK_BOARD_ALARM_TITLE = "Physical Whiteboard Walk Check";

export const WALK_BOARD_ALARM_MESSAGE =
  "Update the No Plays, Grooming, and Walks Board physical whiteboard (not digital). Check No Plays over during the walk. Take photos and upload them.";

export const WALK_BOARD_ALARM_CHECKLIST = [
  "Update the No Plays physical whiteboard",
  "Update the Grooming physical whiteboard",
  "Update the Walks Board physical whiteboard (not digital)",
  "Check No Plays over during the walk",
  "Take pictures and upload them"
] as const;

export const WALK_BOARD_PUSH_FOOTER = "This alarm cannot be snoozed. Mark complete after the physical board is updated.";

export const WALK_BOARD_CYCLE_MS = WALK_BOARD_ALARM_INTERVAL_HOURS * 60 * 60 * 1000;
export const WALK_BOARD_DUE_SOON_MS = 15 * 60 * 1000;
export const WALK_BOARD_MAX_NAME_LENGTH = 80;

export const WALK_BOARD_TYPE_LABELS: Record<
  import("./types").WalkBoardType,
  { label: string; description: string }
> = {
  no_plays: {
    label: "No Plays",
    description: "Check No Plays over during the walk and update the physical board."
  },
  groomed: {
    label: "Grooming",
    description: "Update the Grooming physical whiteboard."
  },
  break_dog: {
    label: "Walks Board",
    description: "Update the Walks Board physical whiteboard (not digital)."
  }
};
