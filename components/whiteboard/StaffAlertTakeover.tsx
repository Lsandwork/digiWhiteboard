"use client";

import { AlertTriangle, BellRing, MapPinOff, PawPrint, PhoneOff, UserRound } from "lucide-react";
import { useStaffPushNoticeAlarm } from "@/hooks/useStaffPushNoticeAlarm";
import { BoardHeader } from "@/components/board/BoardHeader";
import { PushNoticeBoardVeil, PushNoticeFlashLayers } from "@/components/board/PushNoticeFlashLayers";
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
import styles from "@/components/whiteboard/StaffAlertTakeover.module.css";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type StaffAlertTakeoverProps = {
  notice?: StaffPushNotice;
  alert?: StaffActiveAlert;
  clockTime?: string;
  clockDate?: string;
  lastUpdated?: string;
  connection?: ConnectionState;
  lowMotion?: boolean;
  layout?: "full" | "header" | "card";
  fullscreen?: boolean;
};

function NoticeIconFromAlert({ alert }: { alert: StaffActiveAlert }) {
  if (alert.type === "daily_reminder") return <BellRing />;
  if (alert.type === "owner_complaint") {
    if (alert.complaintCategory === "on_phone") return <PhoneOff />;
    if (alert.complaintCategory === "yard_dirty") return <MapPinOff />;
    return <UserRound />;
  }
  const title = alert.title.toLowerCase();
  if (title.includes("phone")) return <PhoneOff />;
  if (title.includes("yard")) return <MapPinOff />;
  return <AlertTriangle />;
}

function NoticeIconFromNotice({ notice }: { notice: StaffPushNotice }) {
  if (isDailyReminderPushNotice(notice)) return <BellRing />;
  if (isDogHandlerComplaintNotice(notice)) {
    if (notice.complaint_category === "on_phone") return <PhoneOff />;
    if (notice.complaint_category === "yard_dirty") return <MapPinOff />;
    return <UserRound />;
  }
  const title = notice.title.toLowerCase();
  if (title.includes("phone")) return <PhoneOff />;
  if (title.includes("yard")) return <MapPinOff />;
  return <AlertTriangle />;
}

function expiresLabel(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function StaffAlertCard({
  notice,
  alert,
  fullscreen = false,
  lowMotion = false
}: {
  notice?: StaffPushNotice;
  alert?: StaffActiveAlert;
  fullscreen?: boolean;
  lowMotion?: boolean;
}) {
  const isDailyReminder = notice ? isDailyReminderPushNotice(notice) : alert?.type === "daily_reminder";
  const isDogHandler = notice
    ? isDogHandlerComplaintNotice(notice)
    : alert?.type === "owner_complaint";
  const isImportant = notice ? isDailyReminder && notice.priority === "important" : false;
  const isAlerting = useStaffPushNoticeAlarm(notice ?? null) && !lowMotion;

  const title = notice
    ? isDailyReminder
      ? "DAILY REMINDER"
      : notice.title
    : isDailyReminder
      ? "DAILY REMINDER"
      : alert?.title ?? "";
  const message = notice?.message ?? alert?.message ?? null;
  const complaintCategory = notice?.complaint_category ?? alert?.complaintCategory;
  const dogHandlerName = notice?.dog_handler_name ?? alert?.dogHandlerName;
  const expiresAt = notice?.expires_at ?? alert?.expiresAt;

  return (
    <article
      className={`staff-push-notice ${isDailyReminder ? "staff-push-notice--daily-reminder" : "staff-push-notice--alert"} ${isImportant ? "staff-push-notice--daily-reminder-important" : ""} ${isDogHandler ? "staff-push-notice--dog-handler" : ""} ${isAlerting ? "staff-push-notice--burst" : ""} ${fullscreen ? "staff-push-notice--fullscreen" : ""} ${lowMotion ? "staff-push-notice--low-motion" : ""}`}
      role="alert"
      aria-live="assertive"
    >
      <PushNoticeFlashLayers tone={isDailyReminder ? "reminder" : "alert"} />

      <div className="staff-push-notice__paw staff-push-notice__paw--one" aria-hidden="true">
        <PawPrint />
      </div>
      <div className="staff-push-notice__paw staff-push-notice__paw--two" aria-hidden="true">
        <PawPrint />
      </div>

      <div className="staff-push-notice__icon" aria-hidden="true">
        {notice ? <NoticeIconFromNotice notice={notice} /> : alert ? <NoticeIconFromAlert alert={alert} /> : <AlertTriangle />}
      </div>
      <p className="staff-push-notice__eyebrow">
        {isDailyReminder ? "Daily Reminder" : isDogHandler ? "Owner Complaint Alert" : "Yard Handler Alert"}
      </p>
      <h2 className="staff-push-notice__title">{title}</h2>
      {isDailyReminder && notice ? (
        <>
          <p className="staff-push-notice__handler-name">{notice.title}</p>
          {notice.daily_reminder_scheduled_time ? (
            <p className="staff-push-notice__handler-name">
              Scheduled: <span>{formatDailyReminderTime(notice.daily_reminder_scheduled_time)}</span>
            </p>
          ) : null}
          {notice.daily_reminder_audience?.length ? (
            <p className="staff-push-notice__handler-name">
              Audience:{" "}
              <span>
                {formatDailyReminderAudience(notice.daily_reminder_audience as ("dog_handler" | "team_lead")[])}
              </span>
            </p>
          ) : null}
          {notice.daily_reminder_sent_type === "early" && notice.daily_reminder_sent_by_name ? (
            <p className="staff-push-notice__management-note">Sent early by {notice.daily_reminder_sent_by_name}</p>
          ) : null}
        </>
      ) : null}
      {isDailyReminder && alert && !notice ? <p className="staff-push-notice__handler-name">{alert.title}</p> : null}
      {isDailyReminder && alert?.dailyReminderMeta && !notice ? (
        <>
          {alert.dailyReminderMeta.scheduledTime ? (
            <p className="staff-push-notice__handler-name">
              Scheduled: <span>{alert.dailyReminderMeta.scheduledTime}</span>
            </p>
          ) : null}
          {alert.dailyReminderMeta.audience?.length ? (
            <p className="staff-push-notice__handler-name">
              Audience: <span>{alert.dailyReminderMeta.audience.join(", ")}</span>
            </p>
          ) : null}
          {alert.dailyReminderMeta.sentByName ? (
            <p className="staff-push-notice__management-note">Sent early by {alert.dailyReminderMeta.sentByName}</p>
          ) : null}
        </>
      ) : null}
      {isDogHandler && complaintCategory ? (
        <p className="staff-push-notice__handler-name">
          Reason: <span>{getOwnerComplaintCategoryLabel(complaintCategory)}</span>
        </p>
      ) : null}
      {isDogHandler && dogHandlerName ? (
        <p className="staff-push-notice__handler-name">
          Dog Handler: <span>{dogHandlerName}</span>
        </p>
      ) : null}
      {message ? (
        <div className="staff-push-notice__message-block">
          {isDogHandler ? <p className="staff-push-notice__message-label">Message:</p> : null}
          <p className="staff-push-notice__message">{message}</p>
        </div>
      ) : null}
      {isDailyReminder ? (
        <p className="staff-push-notice__management-note">
          {notice?.daily_reminder_footer ?? alert?.dailyReminderMeta?.footer ?? DEFAULT_DAILY_REMINDER_FOOTER}
        </p>
      ) : null}
      {isDogHandler ? <p className="staff-push-notice__management-note">Management review required.</p> : null}
      {expiresLabel(expiresAt) ? <p className="staff-push-notice__expires">{expiresLabel(expiresAt)}</p> : null}
    </article>
  );
}

export function StaffAlertTakeover({
  notice,
  alert,
  clockTime = "--:--",
  clockDate = "LOADING",
  lastUpdated,
  connection = "polling",
  lowMotion = false,
  layout = "full",
  fullscreen = true
}: StaffAlertTakeoverProps) {
  const veilTone = notice
    ? isDailyReminderPushNotice(notice)
      ? "reminder"
      : "alert"
    : alert?.veilTone ?? "alert";
  const veilLabel = notice
    ? isDailyReminderPushNotice(notice)
      ? "Daily Reminder Active"
      : "Push Notice Active"
    : alert?.veilLabel ?? "Push Notice Active";
  const isDailyReminder = notice ? isDailyReminderPushNotice(notice) : alert?.type === "daily_reminder";
  const showVeil = layout === "full";
  const showHeader = layout === "full" || layout === "header";

  return (
    <div className={styles.takeoverRoot}>
      {showVeil ? <PushNoticeBoardVeil active tone={veilTone} label={veilLabel} /> : null}

      <div className={styles.takeoverCanvas}>
        {showHeader ? (
          <BoardHeader
            connection={connection}
            clockTime={clockTime}
            clockDate={clockDate}
            lastUpdated={lastUpdated ?? new Date().toISOString()}
            wakeLockStatus="active"
            onRequestWakeLock={() => undefined}
            castKeeperMode
          />
        ) : null}

        <section
          className={`staff-push-notice-fullscreen ${isDailyReminder ? "staff-push-notice-fullscreen--daily-reminder staff-push-notice-fullscreen--alert" : "staff-push-notice-fullscreen--alert"} ${styles.takeoverCardWrap}`}
          aria-label={isDailyReminder ? "Active daily reminder" : "Active yard handler alert"}
        >
          <StaffAlertCard notice={notice} alert={alert} fullscreen={fullscreen} lowMotion={lowMotion} />
        </section>
      </div>
    </div>
  );
}
