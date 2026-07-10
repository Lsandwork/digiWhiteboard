import { loadAdminSettings } from "@/lib/admin/settings";
import { getShiftDate } from "@/lib/staff/daily-reminders";
import {
  isDailyReminderPushNotice,
  isDogHandlerComplaintNotice,
  type OwnerComplaintCategory,
  type StaffPushNotice
} from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";
import { clearShellyAlert, triggerShellyAlert, type ShellyAlertType } from "@/lib/shelly-alert";

const OWNER_COMPLAINT_TITLE_ALERTS: Record<string, ShellyAlertType> = {
  "OWNER COMPLAINT - Engage with dogs": "owner_complaint",
  "OWNER COMPLAINT - Phone Usage": "phone_usage",
  "OWNER COMPLAINT - Dog not on yard": "dog_not_on_yard"
};

function shellyTypeForComplaintCategory(category: OwnerComplaintCategory | null | undefined): ShellyAlertType {
  if (category === "on_phone") return "phone_usage";
  if (category === "yard_dirty") return "dog_not_on_yard";
  return "owner_complaint";
}

export function resolveShellyAlertForPushNotice(notice: StaffPushNotice): { type: ShellyAlertType; eventKey: string } | null {
  const pushKey = `push:${notice.id}`;

  if (isDailyReminderPushNotice(notice) && notice.daily_reminder_id) {
    return { type: "daily_reminder", eventKey: `daily-reminder:${notice.daily_reminder_id}:pending` };
  }

  if (isDogHandlerComplaintNotice(notice)) {
    return {
      type: shellyTypeForComplaintCategory(notice.complaint_category),
      eventKey: pushKey
    };
  }

  const titleMatch = OWNER_COMPLAINT_TITLE_ALERTS[notice.title.trim()];
  if (titleMatch) {
    return { type: titleMatch, eventKey: pushKey };
  }

  if (notice.priority === "urgent" || notice.display_mode === "urgent") {
    return { type: "urgent_front_desk", eventKey: pushKey };
  }

  return { type: "custom_push_notice", eventKey: pushKey };
}

async function resolveDailyReminderEventKey(notice: StaffPushNotice) {
  if (!notice.daily_reminder_id) return `push:${notice.id}`;
  const supabase = getServiceSupabase();
  const settings = await loadAdminSettings(supabase);
  const shiftDate = getShiftDate(settings.timezone);
  return `daily-reminder:${notice.daily_reminder_id}:${shiftDate}`;
}

export async function triggerShellyAlertForPushNotice(notice: StaffPushNotice) {
  const resolved = resolveShellyAlertForPushNotice(notice);
  if (!resolved) return;

  let eventKey = resolved.eventKey;
  if (resolved.type === "daily_reminder") {
    eventKey = await resolveDailyReminderEventKey(notice);
  }

  await triggerShellyAlert(resolved.type, eventKey);
}

export function triggerShellyAlertForPushNoticeFireAndForget(notice: StaffPushNotice) {
  void triggerShellyAlertForPushNotice(notice).catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to trigger Shelly alert for push notice.";
    console.error("[shelly-alert] Push notice trigger failed:", message);
  });
}

export function clearShellyAlertForPushNoticeFireAndForget(reason = "push_notice_clear") {
  void clearShellyAlert(reason).catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to clear Shelly alert for push notice.";
    console.error("[shelly-alert] Push notice clear failed:", message);
  });
}
