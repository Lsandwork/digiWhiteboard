import {
  formatDailyReminderTime,
  isReminderScheduledToday,
  type DailyReminderRow
} from "@/lib/staff/daily-reminders";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import { getWalkBoardUrgency } from "@/lib/walks-board/display";
import { formatWalkBoardHourLabel } from "@/lib/walks-board/schedule";
import type { WalkBoardCycleView } from "@/lib/walks-board/types";
import {
  currentMedicationPeriodAt,
  dateAtLaLocal,
  incompleteMedicationIsOverdue,
  periodLabel
} from "@/lib/tl-digi-board/medication-windows";
import type { TlBoardAdditionalServiceRow, TlGingrMedicationRecord } from "@/lib/tl-digi-board/types";
import { gingrAnimalUrl, gingrReservationUrl } from "./gingr-links";
import {
  alertItemKey,
  medicationItemKey,
  reminderItemKey,
  serviceItemKey,
  walksItemKey
} from "./keys";
import type {
  RuffopsChecklistBucket,
  RuffopsChecklistCompletion,
  RuffopsChecklistCompletedSource,
  RuffopsChecklistItem,
  RuffopsChecklistSummary
} from "./types";

const OVERDUE_AFTER_MS = 15 * 60 * 1000;
const DUE_SOON_MS = 10 * 60 * 1000;
const WALKS_ALARM_NOTE = "walks_board_alarm";

const HIDDEN_REMINDER_STATUSES = new Set([
  "inactive",
  "not_scheduled_today",
  "swing_handler_off"
]);

export function isWalkBoardAlarmReminder(reminder: { internal_notes?: string | null; title?: string | null }) {
  if (String(reminder.internal_notes ?? "").trim() === WALKS_ALARM_NOTE) return true;
  return String(reminder.title ?? "").toLowerCase().includes("physical whiteboard walk check");
}

export function bucketForDueAt(
  dueAt: string | null,
  now: Date,
  completed: boolean
): RuffopsChecklistBucket {
  if (completed) return "completed";
  if (!dueAt) return "due";
  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) return "due";
  const delta = now.getTime() - dueMs;
  if (delta > OVERDUE_AFTER_MS) return "overdue";
  if (delta >= -DUE_SOON_MS) return "due";
  return "upcoming";
}

export function summarizeChecklist(items: RuffopsChecklistItem[]): RuffopsChecklistSummary {
  const summary: RuffopsChecklistSummary = {
    overdue: 0,
    due: 0,
    upcoming: 0,
    completed: 0,
    total: items.length
  };
  for (const item of items) {
    summary[item.bucket] += 1;
  }
  return summary;
}

function formatClock(iso: string | null, timeZone: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });
}

function dueAtFromShiftTime(shiftDate: string, scheduledTime: string, timeZone: string): string | null {
  const [year, month, day] = shiftDate.split("-").map(Number);
  const [hour, minute, second] = scheduledTime.split(":").map(Number);
  if (![year, month, day, hour, minute].every((value) => Number.isFinite(value))) return null;
  try {
    if (timeZone === "America/Los_Angeles") {
      return dateAtLaLocal({
        year,
        month,
        day,
        hour,
        minute: minute || 0,
        second: Number.isFinite(second) ? second : 0
      }).toISOString();
    }
  } catch {
    // fall through
  }
  const padded = `${shiftDate}T${String(hour).padStart(2, "0")}:${String(minute || 0).padStart(2, "0")}:${String(
    Number.isFinite(second) ? second : 0
  ).padStart(2, "0")}`;
  const parsed = Date.parse(padded);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function medicationDueAt(row: TlGingrMedicationRecord): string | null {
  const [year, month, day] = row.serviceDate.split("-").map(Number);
  if (![year, month, day].every((value) => Number.isFinite(value))) return null;
  const hour =
    row.scheduleKind === "mid_day" ? 10 : row.scheduleKind === "pm" ? 16 : 4;
  try {
    return dateAtLaLocal({ year, month, day, hour, minute: 0, second: 0 }).toISOString();
  } catch {
    return null;
  }
}

function periodTitle(row: TlGingrMedicationRecord) {
  if (row.scheduleKind === "other_special") return row.gingrScheduleLabel || "Special";
  return periodLabel(row.scheduleKind);
}

function sortItems(items: RuffopsChecklistItem[]) {
  const bucketOrder: Record<RuffopsChecklistBucket, number> = {
    overdue: 0,
    due: 1,
    upcoming: 2,
    completed: 3
  };
  return [...items].sort((a, b) => {
    const bucketDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return a.title.localeCompare(b.title);
  });
}

function completionFor(map: Map<string, RuffopsChecklistCompletion>, key: string) {
  const row = map.get(key);
  if (!row || row.undone_at) return null;
  return row;
}

function stampFromCompletion(row: RuffopsChecklistCompletion | null): {
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
  completedSource: RuffopsChecklistCompletedSource;
} {
  if (!row) {
    return { completed: false, completedAt: null, completedByName: null, completedSource: null };
  }
  return {
    completed: true,
    completedAt: row.completed_at,
    completedByName: row.completed_by_name,
    completedSource: "ruffops"
  };
}

export type AssembleRuffopsChecklistInput = {
  now: Date;
  shiftDate: string;
  timeZone: string;
  dayKey: string;
  medications?: TlGingrMedicationRecord[];
  additionalServices?: TlBoardAdditionalServiceRow[];
  reminders?: DailyReminderRow[];
  walkCycles?: WalkBoardCycleView[];
  notices?: StaffPushNotice[];
  completions?: Map<string, RuffopsChecklistCompletion> | RuffopsChecklistCompletion[];
};

function completionMap(
  input: AssembleRuffopsChecklistInput["completions"]
): Map<string, RuffopsChecklistCompletion> {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  return new Map(input.map((row) => [row.item_key, row]));
}

export function assembleRuffopsChecklistItems(input: AssembleRuffopsChecklistInput): RuffopsChecklistItem[] {
  const now = input.now;
  const completions = completionMap(input.completions);
  const items: RuffopsChecklistItem[] = [];
  const currentPeriod = currentMedicationPeriodAt(now);

  for (const row of input.medications ?? []) {
    const key = medicationItemKey(row.gingrMedicationId, row.scheduleKind, row.serviceDate);
    const gingrDone = row.administrationStatus === "administered";
    const local = completionFor(completions, key);
    const dueAt = medicationDueAt(row);
    const overdue = !gingrDone && incompleteMedicationIsOverdue(row.scheduleKind, currentPeriod, now);
    const inCurrentWindow =
      row.scheduleKind === "other_special" || row.scheduleKind === currentPeriod;
    const stamp = gingrDone
      ? {
          completed: true,
          completedAt: row.administeredAt,
          completedByName: row.administeredBy,
          completedSource: "gingr" as const
        }
      : stampFromCompletion(local);
    let bucket: RuffopsChecklistBucket = stamp.completed
      ? "completed"
      : overdue
        ? "overdue"
        : inCurrentWindow
          ? "due"
          : bucketForDueAt(dueAt, now, false);
    if (!stamp.completed && !overdue && !inCurrentWindow && bucket === "due") {
      bucket = "upcoming";
    }

    const medBits = [row.dosage, row.instructions, row.notes].filter((value) => String(value ?? "").trim());
    items.push({
      key,
      source: "gingr",
      sourceId: row.gingrMedicationId,
      title: `${row.dogName} · ${row.medicationName} (${periodTitle(row)})`,
      detail: medBits.length ? medBits.join(" · ") : "Administer in Gingr, then this row follows Gingr.",
      dogName: row.dogName,
      lodgingLabel: row.lodgingLabel,
      dueAt,
      dueLabel: formatClock(dueAt, input.timeZone) ?? periodTitle(row),
      bucket,
      completed: stamp.completed,
      completedAt: stamp.completedAt,
      completedByName: stamp.completedByName,
      completedSource: stamp.completedSource,
      checkboxLocked: gingrDone,
      canToggle: !gingrDone,
      gingrUrl: gingrAnimalUrl(row.gingrAnimalId) ?? gingrReservationUrl(row.gingrReservationId),
      actionHint: gingrDone
        ? "Recorded in Gingr"
        : "Open Gingr to administer. Checking here stamps RuffOps as a reminder only.",
      photoUrl: row.photoUrl
    });
  }

  for (const row of input.additionalServices ?? []) {
    const key = serviceItemKey(row.gingrReservationId, row.gingrServiceId, row.serviceDate);
    const gingrDone = row.completionState === "complete";
    const local = completionFor(completions, key);
    const dueAt = row.scheduledAt;
    const stamp = gingrDone
      ? {
          completed: true,
          completedAt: dueAt,
          completedByName: "Gingr",
          completedSource: "gingr" as const
        }
      : stampFromCompletion(local);
    items.push({
      key,
      source: "gingr",
      sourceId: row.gingrServiceId,
      title: `${row.dogName} · ${row.serviceName}`,
      detail:
        row.completionState === "unknown"
          ? "Gingr did not expose a reliable completion flag. Confirm in Gingr."
          : "Complete this additional service in Gingr.",
      dogName: row.dogName,
      lodgingLabel: row.lodgingLabel,
      dueAt,
      dueLabel: formatClock(dueAt, input.timeZone) ?? "Today",
      bucket: stamp.completed ? "completed" : bucketForDueAt(dueAt, now, false),
      completed: stamp.completed,
      completedAt: stamp.completedAt,
      completedByName: stamp.completedByName,
      completedSource: stamp.completedSource,
      checkboxLocked: gingrDone,
      canToggle: !gingrDone,
      gingrUrl: gingrReservationUrl(row.gingrReservationId) ?? gingrAnimalUrl(row.gingrAnimalId),
      actionHint: gingrDone
        ? "Marked complete in Gingr"
        : "Gingr is the system of record. Checking here only stamps the RuffOps reminder.",
      photoUrl: row.photoUrl
    });
  }

  for (const reminder of input.reminders ?? []) {
    if (!reminder.is_active) continue;
    if (isWalkBoardAlarmReminder(reminder)) continue;
    if (HIDDEN_REMINDER_STATUSES.has(reminder.today_status)) continue;
    if (!isReminderScheduledToday(reminder, input.dayKey)) continue;

    const key = reminderItemKey(reminder.id, input.shiftDate);
    const local = completionFor(completions, key);
    const stamp = stampFromCompletion(local);
    const dueAt = dueAtFromShiftTime(input.shiftDate, reminder.scheduled_time, input.timeZone);
    const audience =
      reminder.audience.includes("team_lead") && reminder.audience.includes("dog_handler")
        ? "Handlers + Team Leads"
        : reminder.audience.includes("team_lead")
          ? "Team Leads"
          : "Dog Handlers";
    items.push({
      key,
      source: "reminder",
      sourceId: reminder.id,
      title: reminder.title,
      detail: reminder.message,
      dogName: null,
      lodgingLabel: null,
      dueAt,
      dueLabel: formatDailyReminderTime(reminder.scheduled_time),
      bucket: bucketForDueAt(dueAt, now, stamp.completed),
      completed: stamp.completed,
      completedAt: stamp.completedAt,
      completedByName: stamp.completedByName,
      completedSource: stamp.completedSource,
      checkboxLocked: false,
      canToggle: true,
      gingrUrl: null,
      actionHint: `${audience} daily reminder · shared completion for Team Leads, Managers, and Admins.`,
      photoUrl: null
    });
  }

  for (const cycle of input.walkCycles ?? []) {
    const key = walksItemKey(cycle.id);
    const urgency = getWalkBoardUrgency(cycle, now.getTime());
    const walksDone = cycle.status === "completed";
    const missed = cycle.status === "missed";
    const bucket: RuffopsChecklistBucket = walksDone
      ? "completed"
      : missed || urgency === "overdue"
        ? "overdue"
        : urgency === "upcoming"
          ? "upcoming"
          : "due";
    const who = cycle.completed_by_user?.display_name ?? cycle.completed_by_user?.email ?? null;
    items.push({
      key,
      source: "walks",
      sourceId: cycle.id,
      title: `Physical Whiteboard Walk Check · ${formatWalkBoardHourLabel(cycle.scheduled_hour)}`,
      detail:
        "Update No Plays, Grooming, and Walks Board (physical). Check No Plays during the walk. Take photos and upload them.",
      dogName: null,
      lodgingLabel: null,
      dueAt: cycle.due_at,
      dueLabel: formatWalkBoardHourLabel(cycle.scheduled_hour),
      bucket,
      completed: walksDone,
      completedAt: cycle.completed_at,
      completedByName: who,
      completedSource: walksDone ? "walks" : null,
      checkboxLocked: walksDone || missed,
      canToggle: cycle.status === "pending",
      gingrUrl: null,
      actionHint: missed
        ? "This cycle was missed. The next Walks Board alarm will create a new row."
        : walksDone
          ? "Marked complete on Walks Board"
          : "Checking this also completes the Walks Board alarm for everyone.",
      photoUrl: null
    });
  }

  for (const notice of input.notices ?? []) {
    if (!notice.is_active || notice.cleared_at) continue;
    if (notice.notice_type === "daily_reminder" || notice.daily_reminder_id) continue;
    const source = String(notice.source ?? "").toLowerCase();
    if (source.includes("walk")) continue;

    const key = alertItemKey(notice.id);
    const local = completionFor(completions, key);
    const stamp = stampFromCompletion(local);
    const dueAt = notice.pushed_at ?? notice.created_at;
    const kind =
      notice.notice_type === "owner_complaint_dog_handler"
        ? "Owner complaint"
        : notice.priority === "urgent"
          ? "Urgent alert"
          : "Live push alert";
    items.push({
      key,
      source: "alert",
      sourceId: notice.id,
      title: notice.title,
      detail: notice.message,
      dogName: notice.dog_handler_name ?? null,
      lodgingLabel: null,
      dueAt,
      dueLabel: formatClock(dueAt, input.timeZone),
      bucket: bucketForDueAt(dueAt, now, stamp.completed),
      completed: stamp.completed,
      completedAt: stamp.completedAt,
      completedByName: stamp.completedByName,
      completedSource: stamp.completedSource,
      checkboxLocked: false,
      canToggle: true,
      gingrUrl: null,
      actionHint: `${kind} currently on the staff whiteboard. Checking here is the shared RuffOps acknowledgement.`,
      photoUrl: null
    });
  }

  return sortItems(items);
}
