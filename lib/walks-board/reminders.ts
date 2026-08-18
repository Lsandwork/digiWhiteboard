import { dispatchPersonalStaffEmailNotification } from "@/lib/staff/admin-ops";
import { createAndPushStaffNotice } from "@/lib/staff/push-notices";
import {
  WALK_BOARD_ALARM_CHECKLIST,
  WALK_BOARD_ALARM_MESSAGE,
  WALK_BOARD_ALARM_TITLE,
  WALK_BOARD_PUSH_FOOTER
} from "./constants";
import { listWalkBoardReminderRecipients } from "./recipients";
import { currentWalkBoardSlotKey, formatWalkBoardHourLabel } from "./schedule";
import { ensureCurrentWalkBoardCycle, closeExpiredWalkBoardCycles } from "./server";
import type { WalkBoardCycleRow } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function processWalkBoardReminders(supabase: SupabaseClient, now = new Date()) {
  await closeExpiredWalkBoardCycles(supabase, now);
  const cycle = await ensureCurrentWalkBoardCycle(supabase, now);
  const slotKey = currentWalkBoardSlotKey(now);

  if (!cycle || !slotKey) {
    return { processed: 0, notificationsSent: 0, skipped: 1, reason: "outside_operating_window" as const };
  }
  if (cycle.status !== "pending") {
    return { processed: 1, notificationsSent: 0, skipped: 1, reason: "already_completed" as const, slotKey };
  }

  const { data: existingSend, error: sendLookupError } = await supabase
    .from("walk_board_reminder_sends")
    .select("id")
    .eq("walk_cycle_id", cycle.id)
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (sendLookupError && sendLookupError.code !== "PGRST205" && sendLookupError.code !== "42P01") {
    throw sendLookupError;
  }
  if (existingSend) {
    return { processed: 1, notificationsSent: 0, skipped: 1, reason: "already_sent" as const, slotKey };
  }

  const hourLabel = formatWalkBoardHourLabel(cycle.scheduled_hour);
  const body = [
    WALK_BOARD_ALARM_MESSAGE,
    "",
    ...WALK_BOARD_ALARM_CHECKLIST.map((item) => `• ${item}`),
    "",
    WALK_BOARD_PUSH_FOOTER
  ].join("\n");

  let pushNoticeId: string | null = null;
  try {
    const notice = await createAndPushStaffNotice(
      supabase,
      {
        title: `${WALK_BOARD_ALARM_TITLE} · ${hourLabel}`,
        message: body,
        priority: "important",
        display_mode: "normal",
        display_duration_minutes: 10,
        notice_type: "daily_reminder",
        daily_reminder_scheduled_time: `${String(cycle.scheduled_hour).padStart(2, "0")}:00:00`,
        daily_reminder_audience: ["dog_handler", "team_lead"],
        daily_reminder_sent_by_name: "Walks Board Alarm",
        daily_reminder_footer: WALK_BOARD_PUSH_FOOTER,
        source: "walks_board_alarm",
        source_id: cycle.id
      },
      "walks_board_alarm"
    );
    pushNoticeId = notice.id;
    await supabase
      .from("walk_board_cycles")
      .update({ push_notice_id: notice.id, version: cycle.version + 1 })
      .eq("id", cycle.id)
      .eq("version", cycle.version);
  } catch {
    // Automatic daily-reminder seed still covers staff TV; continue with emails.
  }

  const recipients = await listWalkBoardReminderRecipients(supabase);
  let notificationsSent = 0;
  for (const recipient of recipients) {
    await dispatchPersonalStaffEmailNotification(
      supabase,
      {
        eventType: "updated",
        sourceTable: "walk_board_cycles",
        sourceId: cycle.id,
        sourceTab: "walks_board",
        title: `${WALK_BOARD_ALARM_TITLE} · ${hourLabel}`,
        body,
        priority: "High",
        actor: "walk-board-alarm"
      },
      recipient.email
    );
    notificationsSent += 1;
  }

  const { error: sendInsertError } = await supabase.from("walk_board_reminder_sends").insert({
    walk_cycle_id: cycle.id,
    slot_key: slotKey,
    due_at: cycle.due_at
  });
  if (sendInsertError && sendInsertError.code !== "23505" && sendInsertError.code !== "42P01") {
    throw sendInsertError;
  }

  await supabase.from("walk_board_activity").insert({
    walk_cycle_id: cycle.id,
    action: "reminder_sent",
    actor_user_id: null,
    metadata: { recipient_count: recipients.length, push_notice_id: pushNoticeId, slot_key: slotKey }
  });

  return {
    processed: 1,
    notificationsSent,
    skipped: 0,
    recipientCount: recipients.length,
    slotKey,
    pushNoticeId
  };
}

export type { WalkBoardCycleRow };
