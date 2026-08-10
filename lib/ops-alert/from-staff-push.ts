import { parseChecklistItems, residualMessage } from "@/lib/ops-alert/checklist";
import { formatOpsAlertExpires, resolveOpsAlertAccent, resolveOpsAlertAction } from "@/lib/ops-alert/status";
import type { OpsAlertMetaRow, OpsAlertViewModel } from "@/lib/ops-alert/types";
import {
  DEFAULT_DAILY_REMINDER_FOOTER,
  formatDailyReminderAudience,
  formatDailyReminderTime
} from "@/lib/staff/daily-reminders";
import {
  getOwnerComplaintCategoryLabel,
  isDailyReminderPushNotice,
  isDogHandlerComplaintNotice,
  type StaffPushNotice
} from "@/lib/staff/push-notices";
import type { StaffActiveAlert } from "@/lib/whiteboard/staff-active-alert";

function formatAudienceList(audience: string[] | null | undefined) {
  if (!audience?.length) return null;
  const normalized = audience.map((item) => {
    const token = item.trim().toLowerCase();
    if (token === "dog_handler" || token === "dog handlers") return "DOG HANDLERS";
    if (token === "team_lead" || token === "team leads") return "TEAM LEADS";
    if (token === "management") return "MANAGEMENT";
    if (token === "front_desk" || token === "front desk") return "FRONT DESK";
    if (token === "grooming") return "GROOMING";
    if (token === "training" || token === "trainer") return "TRAINING";
    return item.replace(/_/g, " ").toUpperCase();
  });
  const unique = [...new Set(normalized)];
  if (unique.includes("DOG HANDLERS") && unique.includes("TEAM LEADS") && unique.length === 2) {
    return "DOG HANDLERS + TEAM LEADS";
  }
  return unique.join(" + ");
}

function buildMetaRows(options: {
  scheduledTime?: string | null;
  audience?: string | null;
  extra?: OpsAlertMetaRow[];
}): OpsAlertMetaRow[] {
  const rows: OpsAlertMetaRow[] = [];
  if (options.scheduledTime) {
    rows.push({ label: "Scheduled", value: options.scheduledTime, icon: "clock" });
  }
  if (options.audience) {
    rows.push({ label: "Audience", value: options.audience, icon: "users" });
  }
  if (options.extra?.length) rows.push(...options.extra);
  return rows;
}

export function opsAlertFromStaffPushNotice(notice: StaffPushNotice): OpsAlertViewModel {
  const isDailyReminder = isDailyReminderPushNotice(notice);
  const isDogHandler = isDogHandlerComplaintNotice(notice);
  const checklistItems = parseChecklistItems(notice.message);
  const message = residualMessage(notice.message, checklistItems);

  const scheduledTime = notice.daily_reminder_scheduled_time
    ? formatDailyReminderTime(notice.daily_reminder_scheduled_time)
    : null;
  const audience = notice.daily_reminder_audience?.length
    ? formatDailyReminderAudience(notice.daily_reminder_audience as ("dog_handler" | "team_lead")[]).toUpperCase()
    : null;

  const alertType = isDailyReminder
    ? "DAILY REMINDER"
    : isDogHandler
      ? "YARD HANDLER ALERT"
      : notice.priority === "urgent" || notice.display_mode === "urgent"
        ? "URGENT ALERT"
        : "STAFF NOTICE";

  const accent = resolveOpsAlertAccent({
    priority: notice.priority,
    displayMode: notice.display_mode,
    alertType
  });
  const { action, actionLabel } = resolveOpsAlertAction({
    accent,
    actionRequired: true
  });

  const extra: OpsAlertMetaRow[] = [];
  if (isDogHandler && notice.complaint_category) {
    const reason = getOwnerComplaintCategoryLabel(notice.complaint_category);
    if (reason) {
      extra.push({
        label: "Reason",
        value: reason.toUpperCase(),
        icon: "tag"
      });
    }
  }
  if (isDogHandler && notice.dog_handler_name) {
    extra.push({ label: "Dog Handler", value: notice.dog_handler_name.toUpperCase(), icon: "user" });
  }

  return {
    id: notice.id,
    alertType,
    title: isDailyReminder ? notice.title : notice.title,
    subtitle: null,
    scheduledTime,
    audience,
    message: isDogHandler && !checklistItems.length ? notice.message : message,
    checklistItems,
    metaRows: buildMetaRows({ scheduledTime, audience, extra }),
    accent,
    action,
    actionLabel,
    expirationTime: formatOpsAlertExpires(notice.expires_at),
    createdAt: notice.created_at,
    updatedAt: notice.updated_at,
    status: notice.is_active ? "active" : "cleared",
    note:
      isDailyReminder && notice.daily_reminder_sent_type === "early" && notice.daily_reminder_sent_by_name
        ? `Sent early by ${notice.daily_reminder_sent_by_name}`
        : isDogHandler
          ? "Management review required."
          : null,
    footer: isDailyReminder
      ? notice.daily_reminder_footer ?? DEFAULT_DAILY_REMINDER_FOOTER
      : null
  };
}

export function opsAlertFromActiveAlert(alert: StaffActiveAlert): OpsAlertViewModel {
  const isDailyReminder = alert.type === "daily_reminder";
  const isDogHandler = alert.type === "owner_complaint";
  const checklistItems = parseChecklistItems(alert.message);
  const message = residualMessage(alert.message, checklistItems);

  const scheduledRaw = alert.dailyReminderMeta?.scheduledTime ?? null;
  const scheduledTime = scheduledRaw
    ? scheduledRaw.includes(":") && scheduledRaw.length <= 5
      ? formatDailyReminderTime(scheduledRaw)
      : scheduledRaw
    : null;
  const audience = formatAudienceList(alert.dailyReminderMeta?.audience ?? null);

  const alertType = alert.categoryLabel?.trim() || (isDailyReminder ? "DAILY REMINDER" : "STAFF NOTICE");
  const accent = resolveOpsAlertAccent({
    priority: alert.priority,
    alertType
  });
  const { action, actionLabel } = resolveOpsAlertAction({ accent, actionRequired: true });

  const extra: OpsAlertMetaRow[] = [];
  if (isDogHandler && alert.complaintCategory) {
    const reason = getOwnerComplaintCategoryLabel(alert.complaintCategory);
    if (reason) {
      extra.push({
        label: "Reason",
        value: reason.toUpperCase(),
        icon: "tag"
      });
    }
  }
  if (isDogHandler && alert.dogHandlerName) {
    extra.push({ label: "Dog Handler", value: alert.dogHandlerName.toUpperCase(), icon: "user" });
  }

  return {
    id: alert.id,
    alertType: alertType.toUpperCase(),
    title: alert.title,
    subtitle: null,
    scheduledTime,
    audience,
    message: isDogHandler && !checklistItems.length ? alert.message : message,
    checklistItems,
    metaRows: buildMetaRows({ scheduledTime, audience, extra }),
    accent,
    action,
    actionLabel,
    expirationTime: formatOpsAlertExpires(alert.expiresAt),
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    status: "active",
    note: alert.dailyReminderMeta?.sentByName
      ? `Sent early by ${alert.dailyReminderMeta.sentByName}`
      : isDogHandler
        ? "Management review required."
        : null,
    footer: isDailyReminder
      ? alert.dailyReminderMeta?.footer ?? DEFAULT_DAILY_REMINDER_FOOTER
      : null
  };
}
