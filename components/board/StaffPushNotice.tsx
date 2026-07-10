"use client";

import { StaffAlertCard } from "@/components/whiteboard/StaffAlertTakeover";
import { isDailyReminderPushNotice, type StaffPushNotice } from "@/lib/staff/push-notices";

export function StaffPushNoticeTvOverlay({ active, notice }: { active: boolean; notice?: StaffPushNotice | null }) {
  if (!active) return null;
  const isDailyReminder = notice ? isDailyReminderPushNotice(notice) : false;
  const tone = isDailyReminder ? "reminder" : "alert";
  const label = isDailyReminder ? "Daily Reminder Active" : "Handler Alert Active";

  return (
    <>
      <div className={`staff-push-notice-tv-flash staff-push-notice-tv-flash--${tone}`} aria-hidden="true" />
      <div
        className={`staff-push-notice-tv-flash staff-push-notice-tv-flash--secondary staff-push-notice-tv-flash--${tone}`}
        aria-hidden="true"
      />
      <div className={`staff-push-notice-tv-vignette staff-push-notice-tv-vignette--${tone}`} aria-hidden="true" />
      <div className={`staff-push-notice-tv-bar staff-push-notice-tv-bar--${tone}`} aria-hidden="true">
        <span>{label}</span>
      </div>
    </>
  );
}

export function StaffPushNoticePanel({ notice }: { notice: StaffPushNotice }) {
  const isDailyReminder = isDailyReminderPushNotice(notice);
  return (
    <aside
      className={`staff-push-notice-panel ${isDailyReminder ? "staff-push-notice-panel--daily-reminder staff-push-notice-panel--alert" : "staff-push-notice-panel--alert"}`}
      aria-label={isDailyReminder ? "Active daily reminder" : "Active yard handler alert"}
    >
      <StaffAlertCard notice={notice} />
    </aside>
  );
}

export function StaffPushNoticeFullscreen({ notice }: { notice: StaffPushNotice }) {
  return <StaffAlertCard notice={notice} fullscreen />;
}
