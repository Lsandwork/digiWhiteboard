import { WALK_BOARD_DUE_SOON_MS } from "./constants";
import { WALK_BOARD_TYPE_LABELS } from "./constants";
import type { WalkBoardEntryRow, WalkBoardSummary, WalkBoardUrgency } from "./types";

export function walkBoardTypeLabel(type: WalkBoardEntryRow["walk_type"]): string {
  return WALK_BOARD_TYPE_LABELS[type].label;
}

export function getWalkBoardUrgency(entry: Pick<WalkBoardEntryRow, "next_due_at" | "snooze_used">, nowMs: number): WalkBoardUrgency {
  const dueMs = new Date(entry.next_due_at).getTime();
  const remainingMs = dueMs - nowMs;

  if (entry.snooze_used && remainingMs > 0) {
    return "snoozed";
  }
  if (remainingMs <= 0) {
    return remainingMs === 0 ? "walk_due" : "overdue";
  }
  if (remainingMs <= WALK_BOARD_DUE_SOON_MS) {
    return "due_soon";
  }
  return "on_track";
}

export function formatWalkBoardCountdown(entry: Pick<WalkBoardEntryRow, "next_due_at" | "snooze_used">, nowMs: number): string {
  const urgency = getWalkBoardUrgency(entry, nowMs);
  const dueMs = new Date(entry.next_due_at).getTime();
  const diffMs = Math.abs(dueMs - nowMs);
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  switch (urgency) {
    case "on_track":
      return `Next walk in ${minutes} min`;
    case "due_soon":
      return `Due in ${minutes} min`;
    case "walk_due":
      return "Walk due now";
    case "overdue":
      return `Overdue by ${minutes} min`;
    case "snoozed":
      return `Snoozed once · Due at ${formatWalkBoardClock(entry.next_due_at)}`;
    default:
      return "Walk due now";
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

export function urgencyRank(urgency: WalkBoardUrgency): number {
  switch (urgency) {
    case "overdue":
      return 0;
    case "walk_due":
      return 1;
    case "due_soon":
      return 2;
    case "snoozed":
      return 3;
    default:
      return 4;
  }
}

export function sortWalkBoardEntries<T extends Pick<WalkBoardEntryRow, "next_due_at" | "snooze_used">>(
  entries: T[],
  nowMs: number
): T[] {
  return [...entries].sort((a, b) => {
    const rankDiff = urgencyRank(getWalkBoardUrgency(a, nowMs)) - urgencyRank(getWalkBoardUrgency(b, nowMs));
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime();
  });
}

export function summarizeWalkBoardEntries(
  entries: Pick<WalkBoardEntryRow, "next_due_at" | "snooze_used">[],
  nowMs: number
): WalkBoardSummary {
  let dueNowCount = 0;
  let overdueCount = 0;
  let nextDueAt: string | null = null;

  for (const entry of entries) {
    const urgency = getWalkBoardUrgency(entry, nowMs);
    if (urgency === "walk_due") dueNowCount += 1;
    if (urgency === "overdue") overdueCount += 1;
    if (!nextDueAt || new Date(entry.next_due_at).getTime() < new Date(nextDueAt).getTime()) {
      nextDueAt = entry.next_due_at;
    }
  }

  return {
    activeCount: entries.length,
    dueNowCount,
    overdueCount,
    nextDueAt
  };
}

export function buildWalkDueNotificationMessage(
  dogName: string,
  walkType: WalkBoardEntryRow["walk_type"],
  snoozeUsed: boolean
): string {
  const typeLabel = walkBoardTypeLabel(walkType);
  if (snoozeUsed) {
    return `${dogName} is due for a walk — ${typeLabel}. Snooze already used.`;
  }
  return `${dogName} is due for a walk — ${typeLabel}.`;
}
