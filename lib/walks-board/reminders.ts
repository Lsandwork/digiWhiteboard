import { dispatchPersonalStaffEmailNotification } from "@/lib/staff/admin-ops";
import { buildWalkDueNotificationMessage } from "./display";
import { listWalkBoardReminderRecipients } from "./recipients";
import type { WalkBoardEntryRow } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

async function insertActivity(
  supabase: SupabaseClient,
  input: {
    walkEntryId: string;
    action: "walk_due" | "reminder_sent";
    previousDueAt?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("walk_board_activity").insert({
    walk_entry_id: input.walkEntryId,
    action: input.action,
    actor_user_id: null,
    previous_due_at: input.previousDueAt ?? null,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}

export async function processWalkBoardReminders(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { data: dueEntries, error } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("status", "active")
    .lte("next_due_at", nowIso);
  if (error) throw error;

  const recipients = await listWalkBoardReminderRecipients(supabase);
  let processed = 0;
  let notificationsSent = 0;
  let skipped = 0;

  for (const raw of dueEntries ?? []) {
    const entry = raw as WalkBoardEntryRow;
    processed += 1;

    const { data: existingSend, error: sendLookupError } = await supabase
      .from("walk_board_reminder_sends")
      .select("id")
      .eq("walk_entry_id", entry.id)
      .eq("cycle_started_at", entry.cycle_started_at)
      .eq("due_at", entry.next_due_at)
      .maybeSingle();
    if (sendLookupError) throw sendLookupError;
    if (existingSend) {
      skipped += 1;
      continue;
    }

    const { error: dueActivityError } = await supabase.from("walk_board_activity").insert({
      walk_entry_id: entry.id,
      action: "walk_due",
      actor_user_id: null,
      previous_due_at: entry.next_due_at,
      metadata: { automated: true }
    });
    if (dueActivityError && dueActivityError.code !== "23505") throw dueActivityError;

    const message = buildWalkDueNotificationMessage(entry.dog_name, entry.walk_type, entry.snooze_used);

    for (const recipient of recipients) {
      await dispatchPersonalStaffEmailNotification(
        supabase,
        {
          eventType: "updated",
          sourceTable: "walk_board_entries",
          sourceId: entry.id,
          sourceTab: "walks_board",
          title: "Walk Due",
          body: message,
          priority: entry.snooze_used ? "High" : "Medium",
          actor: "walk-board-scheduler"
        },
        recipient.email
      );
      notificationsSent += 1;
    }

    const { error: sendInsertError } = await supabase.from("walk_board_reminder_sends").insert({
      walk_entry_id: entry.id,
      cycle_started_at: entry.cycle_started_at,
      due_at: entry.next_due_at
    });
    if (sendInsertError) {
      if (sendInsertError.code === "23505") {
        skipped += 1;
        continue;
      }
      throw sendInsertError;
    }

    await insertActivity(supabase, {
      walkEntryId: entry.id,
      action: "reminder_sent",
      previousDueAt: entry.next_due_at,
      metadata: {
        recipient_count: recipients.length,
        snooze_used: entry.snooze_used
      }
    });
  }

  return { processed, notificationsSent, skipped, recipientCount: recipients.length };
}
