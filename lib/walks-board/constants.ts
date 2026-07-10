export const WALK_BOARD_CYCLE_MS = 60 * 60 * 1000;
export const WALK_BOARD_SNOOZE_MS = 60 * 60 * 1000;
export const WALK_BOARD_DUE_SOON_MS = 15 * 60 * 1000;
export const WALK_BOARD_MAX_NAME_LENGTH = 80;

export const WALK_BOARD_TYPE_LABELS: Record<
  import("./types").WalkBoardType,
  { label: string; description: string }
> = {
  no_plays: {
    label: "No Plays",
    description: "Dog is not participating in group play."
  },
  groomed: {
    label: "Groomed Dogs",
    description: "Keep clean after grooming."
  },
  break_dog: {
    label: "Break Dogs",
    description: "Dog is temporarily taking a break from play."
  }
};
