"use client";

import { AlertTriangle, BellRing, MapPinOff, PawPrint, PhoneOff, UserRound } from "lucide-react";
import { useStaffPushNoticeAlarm } from "@/hooks/useStaffPushNoticeAlarm";
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

function NoticeIcon({ notice }: { notice: StaffPushNotice }) {
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

function NoticeContent({ notice, fullscreen = false }: { notice: StaffPushNotice; fullscreen?: boolean }) {
  const isDailyReminder = isDailyReminderPushNotice(notice);
  const isBursting = useStaffPushNoticeAlarm(isDailyReminder ? null : notice);
  const isDogHandler = isDogHandlerComplaintNotice(notice);
  const isImportant = isDailyReminder && notice.priority === "important";

  return (
    <article
      className={`staff-push-notice ${isDailyReminder ? "staff-push-notice--daily-reminder" : "staff-push-notice--alert"} ${isImportant ? "staff-push-notice--daily-reminder-important" : ""} ${isDogHandler ? "staff-push-notice--dog-handler" : ""} ${isBursting ? "staff-push-notice--burst" : ""} ${fullscreen ? "staff-push-notice--fullscreen" : ""}`}
      role="alert"
      aria-live={isDailyReminder ? "polite" : "assertive"}
    >
      {!isDailyReminder ? (
        <>
          <div className="staff-push-notice__flash" aria-hidden="true" />
          <div className="staff-push-notice__flash staff-push-notice__flash--secondary" aria-hidden="true" />
          <div className="staff-push-notice__flash staff-push-notice__flash--tertiary" aria-hidden="true" />
          <div className="staff-push-notice__edge-flash" aria-hidden="true" />
          <div className="staff-push-notice__scanlines" aria-hidden="true" />
          <div className="staff-push-notice__stripes" aria-hidden="true" />
          <div className="staff-push-notice__strobe-ring" aria-hidden="true" />
          <div className="staff-push-notice__strobe-ring staff-push-notice__strobe-ring--outer" aria-hidden="true" />
          <span className="staff-push-notice__beacon staff-push-notice__beacon--tl" aria-hidden="true" />
          <span className="staff-push-notice__beacon staff-push-notice__beacon--tr" aria-hidden="true" />
          <span className="staff-push-notice__beacon staff-push-notice__beacon--bl" aria-hidden="true" />
          <span className="staff-push-notice__beacon staff-push-notice__beacon--br" aria-hidden="true" />
        </>
      ) : null}

      <div className="staff-push-notice__paw staff-push-notice__paw--one" aria-hidden="true">
        <PawPrint />
      </div>
      <div className="staff-push-notice__paw staff-push-notice__paw--two" aria-hidden="true">
        <PawPrint />
      </div>

      <div className="staff-push-notice__icon" aria-hidden="true">
        <NoticeIcon notice={notice} />
      </div>
      <p className="staff-push-notice__eyebrow">
        {isDailyReminder ? "Daily Reminder" : isDogHandler ? "Owner Complaint Alert" : "Yard Handler Alert"}
      </p>
      <h2 className="staff-push-notice__title">{isDailyReminder ? "DAILY REMINDER" : notice.title}</h2>
      {isDailyReminder ? (
        <>
          <p className="staff-push-notice__handler-name">
            {notice.title}
          </p>
          {notice.daily_reminder_scheduled_time ? (
            <p className="staff-push-notice__handler-name">
              Scheduled: <span>{formatDailyReminderTime(notice.daily_reminder_scheduled_time)}</span>
            </p>
          ) : null}
          {notice.daily_reminder_audience?.length ? (
            <p className="staff-push-notice__handler-name">
              Audience: <span>{formatDailyReminderAudience(notice.daily_reminder_audience as ("dog_handler" | "team_lead")[])}</span>
            </p>
          ) : null}
          {notice.daily_reminder_sent_type === "early" && notice.daily_reminder_sent_by_name ? (
            <p className="staff-push-notice__management-note">Sent early by {notice.daily_reminder_sent_by_name}</p>
          ) : null}
        </>
      ) : null}
      {isDogHandler && notice.complaint_category ? (
        <p className="staff-push-notice__handler-name">
          Reason: <span>{getOwnerComplaintCategoryLabel(notice.complaint_category)}</span>
        </p>
      ) : null}
      {isDogHandler && notice.dog_handler_name ? (
        <p className="staff-push-notice__handler-name">
          Dog Handler: <span>{notice.dog_handler_name}</span>
        </p>
      ) : null}
      {notice.message ? (
        <div className="staff-push-notice__message-block">
          {isDogHandler ? <p className="staff-push-notice__message-label">Message:</p> : null}
          <p className="staff-push-notice__message">{notice.message}</p>
        </div>
      ) : null}
      {isDailyReminder ? (
        <p className="staff-push-notice__management-note">
          {notice.daily_reminder_footer || DEFAULT_DAILY_REMINDER_FOOTER}
        </p>
      ) : null}
      {isDogHandler ? <p className="staff-push-notice__management-note">Management review required.</p> : null}
      {expiresLabel(notice) ? <p className="staff-push-notice__expires">{expiresLabel(notice)}</p> : null}
    </article>
  );
}

function expiresLabel(notice: StaffPushNotice) {
  if (!notice.expires_at) return null;
  const date = new Date(notice.expires_at);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function StaffPushNoticeTvOverlay({ active, notice }: { active: boolean; notice?: StaffPushNotice | null }) {
  if (!active || (notice && isDailyReminderPushNotice(notice))) return null;
  return (
    <>
      <div className="staff-push-notice-tv-flash" aria-hidden="true" />
      <div className="staff-push-notice-tv-flash staff-push-notice-tv-flash--secondary" aria-hidden="true" />
      <div className="staff-push-notice-tv-vignette" aria-hidden="true" />
      <div className="staff-push-notice-tv-bar" aria-hidden="true">
        <span>Handler Alert Active</span>
      </div>
    </>
  );
}

export function StaffPushNoticePanel({ notice }: { notice: StaffPushNotice }) {
  const isDailyReminder = isDailyReminderPushNotice(notice);
  return (
    <aside
      className={`staff-push-notice-panel ${isDailyReminder ? "staff-push-notice-panel--daily-reminder" : "staff-push-notice-panel--alert"}`}
      aria-label={isDailyReminder ? "Active daily reminder" : "Active yard handler alert"}
    >
      <NoticeContent notice={notice} />
    </aside>
  );
}

export function StaffPushNoticeFullscreen({ notice }: { notice: StaffPushNotice }) {
  const isDailyReminder = isDailyReminderPushNotice(notice);
  return (
    <section
      className={`staff-push-notice-fullscreen ${isDailyReminder ? "staff-push-notice-fullscreen--daily-reminder" : "staff-push-notice-fullscreen--alert"}`}
      aria-label={isDailyReminder ? "Active daily reminder" : "Active yard handler alert"}
    >
      <NoticeContent notice={notice} fullscreen />
    </section>
  );
}
