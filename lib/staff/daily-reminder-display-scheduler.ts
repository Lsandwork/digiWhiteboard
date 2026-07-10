type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { releaseQueuedDailyReminders, sendDueDailyReminders } from "@/lib/staff/daily-reminders";

const DISPLAY_SCHEDULER_MIN_INTERVAL_MS = 55_000;

let lastDisplaySchedulerRunAt = 0;

export async function runDailyReminderDisplayScheduler(supabase: SupabaseClient) {
  const now = Date.now();
  if (now - lastDisplaySchedulerRunAt < DISPLAY_SCHEDULER_MIN_INTERVAL_MS) {
    return { checked: false as const };
  }

  lastDisplaySchedulerRunAt = now;
  try {
    const sendSummary = await sendDueDailyReminders(supabase);
    const releaseSummary = await releaseQueuedDailyReminders(supabase);
    return { checked: true as const, sendSummary, releaseSummary };
  } catch (error) {
    lastDisplaySchedulerRunAt = 0;
    throw error;
  }
}
