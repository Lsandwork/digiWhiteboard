import { WALK_BOARD_DUE_SOON_MS } from "./constants";
import { formatWalkBoardHourLabel } from "./schedule";
import type { WalkBoardCycleRow, WalkBoardSummary, WalkBoardUrgency } from "./types";

export function getWalkBoardUrgency(
  cycle: Pick<WalkBoardCycleRow, "status" | "due_at">,
  nowMs: number
): WalkBoardUrgency {
  if (cycle.status === "completed") return "completed";
  if (cycle.status === "missed") return "closed";
  const dueMs = new Date(cycle.due_at).getTime();
  const remainingMs = dueMs - nowMs;
  if (remainingMs > WALK_BOARD_DUE_SOON_MS) return "upcoming";
  if (remainingMs > 0) return "due_soon";
  if (nowMs - dueMs > 15 * 60 * 1000) return "overdue";
  return "alarm_due";
}

export function formatWalkBoardCountdown(
  cycle: Pick<WalkBoardCycleRow, "status" | "due_at" | "scheduled_hour">,
  nowMs: number
): string {
  const urgency = getWalkBoardUrgency(cycle, nowMs);
  const dueMs = new Date(cycle.due_at).getTime();
  const minutes = Math.max(1, Math.round(Math.abs(dueMs - nowMs) / 60_000));
  switch (urgency) {
    case "completed":
      return "Marked complete";
    case "closed":
      return "Missed this cycle";
    case "upcoming":
      return `Next alarm in ${minutes} min`;
    case "due_soon":
      return `Due in ${minutes} min`;
    case "overdue":
      return `Overdue by ${minutes} min`;
    default:
      return `Alarm due · ${formatWalkBoardHourLabel(cycle.scheduled_hour)}`;
  }
}

export function formatWalkBoardClock(iso: string, timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(iso));
}

export function formatWalkBoardDateTime(iso: string, timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(iso));
}

export function summarizeWalkBoardCycles(
  cycles: Pick<WalkBoardCycleRow, "status" | "due_at">[],
  nowMs: number
): WalkBoardSummary {
  let pendingCount = 0;
  let completedCount = 0;
  let overdueCount = 0;
  let nextDueAt: string | null = null;

  for (const cycle of cycles) {
    if (cycle.status === "completed") completedCount += 1;
    if (cycle.status === "pending") {
      pendingCount += 1;
      const urgency = getWalkBoardUrgency(cycle, nowMs);
      if (urgency === "overdue" || urgency === "alarm_due") overdueCount += 1;
      if (!nextDueAt || new Date(cycle.due_at).getTime() < new Date(nextDueAt).getTime()) {
        nextDueAt = cycle.due_at;
      }
    }
  }

  return {
    todayCount: cycles.length,
    pendingCount,
    completedCount,
    overdueCount,
    nextDueAt
  };
}

export function buildWalkDueNotificationMessage(): string {
  return "ALERT: Update the No Plays, Grooming, and Walks Board physical whiteboard. Check No Plays over during the walk, take pictures, and upload them. This alarm cannot be snoozed — mark complete when done.";
}

export function walkBoardTypeLabel(): string {
  return "Physical whiteboard walk check";
}
