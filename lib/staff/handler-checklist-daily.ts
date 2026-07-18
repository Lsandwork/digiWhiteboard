import { loadAdminSettings } from "@/lib/admin/settings";
import {
  formatDailyReminderTime,
  getDayKey,
  getShiftDate,
  isReminderScheduledToday,
  listDailyRemindersWithState,
  targetsDogHandlers,
  type DailyReminderTodayStatus
} from "@/lib/staff/daily-reminders";
import { listStaffPushNotices, type StaffPushNotice } from "@/lib/staff/push-notices";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type HandlerDailyChecklistSource = "daily_reminder" | "push_notice";

export type HandlerDailyChecklistItem = {
  key: string;
  title: string;
  detail: string | null;
  scheduled_label: string | null;
  source: HandlerDailyChecklistSource;
  source_id: string;
};

const HANDLER_DAILY_STATUSES = new Set<DailyReminderTodayStatus>([
  "pending_today",
  "sent_early_today",
  "sent_automatic_today",
  "force_resent_today",
  "queued_today"
]);

export function dailyReminderChecklistKey(reminderId: string, shiftDate: string) {
  return `daily_reminder:${reminderId}:${shiftDate}`;
}

export function dailyPushNoticeChecklistKey(noticeId: string, shiftDate: string) {
  return `push_notice_day:${noticeId}:${shiftDate}`;
}

export function isHandlerDailyChecklistKey(key: string) {
  return key.startsWith("daily_reminder:") || key.startsWith("push_notice_day:");
}

function isDayRecurringPushNotice(notice: StaffPushNotice) {
  if ((notice.recurrence ?? "none") !== "day") return false;
  if (notice.daily_reminder_id) return false;
  if (notice.notice_type === "daily_reminder") return false;
  if (notice.schedule_enabled === false) return false;
  return true;
}

function noticeTargetsDogHandlers(notice: StaffPushNotice) {
  const audience = notice.daily_reminder_audience;
  if (!Array.isArray(audience) || audience.length === 0) return true;
  return audience.map((value) => String(value)).includes("dog_handler");
}

export async function listHandlerDailyChecklistItems(
  supabase: SupabaseClient,
  options?: { timeZone?: string; now?: Date }
): Promise<{ items: HandlerDailyChecklistItem[]; shiftDate: string; timeZone: string }> {
  const settings = await loadAdminSettings(supabase);
  const timeZone = options?.timeZone ?? settings.timezone;
  const now = options?.now ?? new Date();
  const shiftDate = getShiftDate(timeZone, now);
  const dayKey = getDayKey(timeZone, now);

  const [{ reminders }, notices] = await Promise.all([
    listDailyRemindersWithState(supabase, { timeZone }),
    listStaffPushNotices(supabase, 200)
  ]);

  const items: HandlerDailyChecklistItem[] = [];
  const seenKeys = new Set<string>();

  for (const reminder of reminders) {
    if (!reminder.is_active) continue;
    if (!targetsDogHandlers(reminder)) continue;
    if (!isReminderScheduledToday(reminder, dayKey)) continue;
    if (!HANDLER_DAILY_STATUSES.has(reminder.today_status)) continue;

    const key = dailyReminderChecklistKey(reminder.id, shiftDate);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    items.push({
      key,
      title: reminder.title,
      detail: reminder.message,
      scheduled_label: formatDailyReminderTime(reminder.scheduled_time),
      source: "daily_reminder",
      source_id: reminder.id
    });
  }

  for (const notice of notices) {
    if (!isDayRecurringPushNotice(notice)) continue;
    if (!noticeTargetsDogHandlers(notice)) continue;

    const key = dailyPushNoticeChecklistKey(notice.id, shiftDate);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    items.push({
      key,
      title: notice.title,
      detail: notice.message,
      scheduled_label: "Repeats daily",
      source: "push_notice",
      source_id: notice.id
    });
  }

  return { items, shiftDate, timeZone };
}
