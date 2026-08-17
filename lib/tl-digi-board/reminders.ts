type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { listDailyRemindersWithState } from "@/lib/staff/daily-reminders";
import { TL_DIGI_BOARD_TIMEZONE } from "@/lib/tl-digi-board/constants";

export type TlBoardReminderCard = {
  id: string;
  title: string;
  message: string;
  scheduledTime: string;
};

function formatReminderClock(scheduledTime: string) {
  const [hoursRaw, minutesRaw] = scheduledTime.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return scheduledTime;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Reuse existing Daily Reminders source of truth.
 * Until display_targets is added, TL board shows active reminders that include team_lead audience.
 */
export async function loadTlBoardDailyReminders(supabase: SupabaseClient): Promise<TlBoardReminderCard[]> {
  try {
    const { reminders } = await listDailyRemindersWithState(supabase, {
      timeZone: TL_DIGI_BOARD_TIMEZONE
    });
    return reminders
      .filter((reminder) => reminder.is_active && reminder.audience.includes("team_lead"))
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
