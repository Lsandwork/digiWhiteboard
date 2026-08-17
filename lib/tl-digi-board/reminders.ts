type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import {
  getDayKey,
  getZonedParts,
  isReminderScheduledToday,
  type DailyReminder,
  type DailyReminderTodayStatus
} from "@/lib/staff/daily-reminders";
import { listDailyRemindersWithState } from "@/lib/staff/daily-reminders";
import { TL_DIGI_BOARD_TIMEZONE } from "@/lib/tl-digi-board/constants";

export type TlBoardReminderCard = {
  id: string;
  title: string;
  message: string;
  scheduledTime: string;
};

/** TL board shows Team Lead reminders this many minutes before automatic staff-TV push. */
export const TL_BOARD_REMINDER_LEAD_MINUTES = 30;

function formatReminderClock(scheduledTime: string) {
  const [hoursRaw, minutesRaw] = scheduledTime.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return scheduledTime;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function minutesFromTime(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");
  return Number(hoursRaw) * 60 + Number(minutesRaw);
}

function zonedMinutesNow(timeZone: string, now: Date) {
  const parts = getZonedParts(now, timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

const HIDDEN_AFTER_PUSH: DailyReminderTodayStatus[] = [
  "sent_automatic_today",
  "sent_early_today",
  "force_resent_today",
  "queued_today"
];

/**
 * Team Lead TV shows a reminder only in the 30-minute window before the automatic
 * staff whiteboard push (at scheduled_time). Otherwise it stays hidden.
 */
export function isReminderVisibleOnTlBoard(
  reminder: Pick<
    DailyReminder,
    "scheduled_time" | "is_active" | "audience" | "active_days" | "requires_swing_handler"
  >,
  options: {
    timeZone: string;
    now?: Date;
    dayKey?: string;
    swingHandlerPresent?: boolean;
    todayStatus?: DailyReminderTodayStatus | null;
  }
): boolean {
  if (!reminder.is_active) return false;
  if (!reminder.audience.includes("team_lead")) return false;

  const now = options.now ?? new Date();
  const timeZone = options.timeZone;
  const dayKey = options.dayKey ?? getDayKey(timeZone, now);

  if (!isReminderScheduledToday(reminder, dayKey)) return false;
  if (reminder.requires_swing_handler && !options.swingHandlerPresent) return false;

  const todayStatus = options.todayStatus;
  if (todayStatus && HIDDEN_AFTER_PUSH.includes(todayStatus)) return false;

  const nowMinutes = zonedMinutesNow(timeZone, now);
  const scheduledMinutes = minutesFromTime(reminder.scheduled_time);
  const leadMinutes = scheduledMinutes - TL_BOARD_REMINDER_LEAD_MINUTES;

  if (leadMinutes >= 0) {
    return nowMinutes >= leadMinutes && nowMinutes < scheduledMinutes;
  }

  // Scheduled shortly after midnight — lead window starts late previous evening.
  return nowMinutes >= leadMinutes + 24 * 60 || (nowMinutes >= 0 && nowMinutes < scheduledMinutes);
}

/**
 * Reuse existing Daily Reminders source of truth.
 * TL board only surfaces reminders in the pre-push visibility window for Team Leads.
 */
export async function loadTlBoardDailyReminders(
  supabase: SupabaseClient,
  options?: { now?: Date }
): Promise<TlBoardReminderCard[]> {
  try {
    const now = options?.now ?? new Date();
    const { reminders, swingHandlerPresent, timeZone: loadedZone } = await listDailyRemindersWithState(supabase, {
      timeZone: TL_DIGI_BOARD_TIMEZONE
    });
    const timeZone = loadedZone ?? TL_DIGI_BOARD_TIMEZONE;
    const dayKey = getDayKey(timeZone, now);

    return reminders
      .filter((reminder) =>
        isReminderVisibleOnTlBoard(reminder, {
          timeZone,
          now,
          dayKey,
          swingHandlerPresent,
          todayStatus: reminder.today_status
        })
      )
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
      .slice(0, 12)
      .map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        message: reminder.message,
        scheduledTime: formatReminderClock(reminder.scheduled_time)
      }));
  } catch {
    return [];
  }
}
