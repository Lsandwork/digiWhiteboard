import {
  getOwnerComplaintCategoryLabel,
  isDailyReminderPushNotice,
  type OwnerComplaintCategory,
  type StaffPushNotice
} from "@/lib/staff/push-notices";
import type { CastLiteGroomingPush, CastLitePushNotice, CastLiteVideoPush, StaffWhiteboardStatePayload } from "@/lib/whiteboard/state";

export type StaffActiveAlertType =
  | "push_notice"
  | "owner_complaint"
  | "urgent_push"
  | "daily_reminder"
  | "grooming_push"
  | "cast_video";

export type StaffActiveAlertIcon = "alert" | "phone" | "yard" | "user" | "bell";

export type StaffActiveAlertVeilTone = "alert" | "reminder" | "grooming" | "cast";

export type StaffActiveAlert = {
  id: string;
  type: StaffActiveAlertType;
  priority: StaffPushNotice["priority"];
  categoryLabel: string;
  title: string;
  message: string | null;
  icon: StaffActiveAlertIcon;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  veilTone: StaffActiveAlertVeilTone;
  veilLabel: string;
  dogHandlerName?: string | null;
  complaintCategory?: OwnerComplaintCategory | null;
  dailyReminderMeta?: {
    scheduledTime: string | null;
    audience: string[] | null;
    sentByName: string | null;
    footer: string | null;
  };
};

export type StaffCastDisplayMode =
  | { mode: "dashboard" }
  | { mode: "push_takeover"; alert: StaffActiveAlert }
  | { mode: "grooming_takeover"; grooming: CastLiteGroomingPush }
  | { mode: "video_takeover"; video: CastLiteVideoPush };

function formatAlertTitle(title: string) {
  return title.trim();
}

function isOwnerComplaintNotice(notice: Pick<StaffPushNotice, "notice_type" | "title" | "complaint_category">) {
  if (notice.notice_type === "owner_complaint_dog_handler") return true;
  if (notice.complaint_category) return true;
  return notice.title.toLowerCase().includes("owner complaint");
}

function resolvePushIcon(notice: Pick<StaffPushNotice, "title" | "complaint_category" | "notice_type">): StaffActiveAlertIcon {
  if (isDailyReminderPushNotice(notice as StaffPushNotice)) return "bell";
  if (notice.complaint_category === "on_phone" || notice.title.toLowerCase().includes("phone")) return "phone";
  if (notice.complaint_category === "yard_dirty" || notice.title.toLowerCase().includes("yard")) return "yard";
  if (isOwnerComplaintNotice(notice)) return "user";
  return "alert";
}

function resolvePushCategoryLabel(notice: StaffPushNotice) {
  if (isDailyReminderPushNotice(notice)) return "DAILY REMINDER";
  if (isOwnerComplaintNotice(notice)) return "YARD HANDLER ALERT";
  if (notice.priority === "urgent" || notice.display_mode === "urgent") return "YARD HANDLER ALERT";
  return "STAFF NOTICE";
}

function resolvePushType(notice: StaffPushNotice): StaffActiveAlertType {
  if (isDailyReminderPushNotice(notice)) return "daily_reminder";
  if (isOwnerComplaintNotice(notice)) return "owner_complaint";
  if (notice.priority === "urgent" || notice.display_mode === "urgent") return "urgent_push";
  return "push_notice";
}

function resolvePushVeil(notice: StaffPushNotice) {
  if (isDailyReminderPushNotice(notice)) {
    return { veilTone: "reminder" as const, veilLabel: "Daily Reminder Active" };
  }
  return { veilTone: "alert" as const, veilLabel: "Push Notice Active" };
}

export function staffPushNoticeToActiveAlert(notice: StaffPushNotice): StaffActiveAlert {
  const veil = resolvePushVeil(notice);
  const isDailyReminder = isDailyReminderPushNotice(notice);

  return {
    id: notice.id,
    type: resolvePushType(notice),
    priority: notice.priority,
    categoryLabel: resolvePushCategoryLabel(notice),
    title: formatAlertTitle(notice.title),
    message: notice.message,
    icon: resolvePushIcon(notice),
    createdAt: notice.created_at,
    updatedAt: notice.updated_at,
    expiresAt: notice.expires_at,
    veilTone: veil.veilTone,
    veilLabel: veil.veilLabel,
    dogHandlerName: notice.dog_handler_name,
    complaintCategory: notice.complaint_category,
    dailyReminderMeta: isDailyReminder
      ? {
          scheduledTime: notice.daily_reminder_scheduled_time ?? null,
          audience: notice.daily_reminder_audience ?? null,
          sentByName: notice.daily_reminder_sent_by_name ?? null,
          footer: notice.daily_reminder_footer ?? null
        }
      : undefined
  };
}

function castPushToActiveAlert(notice: CastLitePushNotice): StaffActiveAlert {
  const isDailyReminder = notice.is_daily_reminder;
  const isOwnerComplaint = notice.notice_type === "owner_complaint_dog_handler";

  let type: StaffActiveAlertType = "push_notice";
  if (isDailyReminder) type = "daily_reminder";
  else if (isOwnerComplaint) type = "owner_complaint";
  else if (notice.priority === "urgent" || notice.display_mode === "urgent") type = "urgent_push";

  const categoryLabel = isDailyReminder
    ? "DAILY REMINDER"
    : isOwnerComplaint || notice.priority === "urgent" || notice.display_mode === "urgent"
      ? "YARD HANDLER ALERT"
      : "STAFF NOTICE";

  const icon: StaffActiveAlertIcon = isDailyReminder
    ? "bell"
    : notice.complaint_category === "on_phone" || notice.title.toLowerCase().includes("phone")
      ? "phone"
      : notice.complaint_category === "yard_dirty" || notice.title.toLowerCase().includes("yard")
        ? "yard"
        : isOwnerComplaint
          ? "user"
          : "alert";

  return {
    id: notice.id,
    type,
    priority: notice.priority,
    categoryLabel,
    title: formatAlertTitle(notice.title),
    message: notice.message,
    icon,
    createdAt: null,
    updatedAt: null,
    expiresAt: notice.expires_at,
    veilTone: isDailyReminder ? "reminder" : "alert",
    veilLabel: isDailyReminder ? "Daily Reminder Active" : "Push Notice Active",
    dogHandlerName: notice.dog_handler_name,
    complaintCategory: notice.complaint_category,
    dailyReminderMeta: isDailyReminder
      ? {
          scheduledTime: notice.daily_reminder_scheduled_time ?? null,
          audience: notice.daily_reminder_audience ?? null,
          sentByName: notice.daily_reminder_sent_by_name ?? null,
          footer: notice.daily_reminder_footer ?? null
        }
      : undefined
  };
}

export function resolveStaffCastDisplay(
  payload: StaffWhiteboardStatePayload,
  options: { noVideo?: boolean } = {}
): StaffCastDisplayMode {
  // Match laptop board: only urgent / owner-complaint pushes take over the full screen.
  // Routine notices must not hide checkout dogs on the casted TV.
  if (payload.activePushNotice) {
    const notice = payload.activePushNotice;
    const isUrgent =
      notice.priority === "urgent" ||
      notice.display_mode === "urgent" ||
      notice.notice_type === "owner_complaint_dog_handler" ||
      Boolean(notice.complaint_category);
    if (isUrgent) {
      return { mode: "push_takeover", alert: castPushToActiveAlert(notice) };
    }
  }

  if (payload.activeGroomingPush) {
    return { mode: "grooming_takeover", grooming: payload.activeGroomingPush };
  }

  if (!options.noVideo && payload.activeVideoPush) {
    return { mode: "video_takeover", video: payload.activeVideoPush };
  }

  if (payload.activeDailyReminder) {
    return { mode: "push_takeover", alert: castPushToActiveAlert(payload.activeDailyReminder) };
  }

  return { mode: "dashboard" };
}

export function ownerComplaintDetail(category?: OwnerComplaintCategory | null) {
  if (!category) return null;
  return getOwnerComplaintCategoryLabel(category);
}
