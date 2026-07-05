"use client";

import { AlertTriangle, MapPinOff, PawPrint, PhoneOff, UserRound } from "lucide-react";
import { useStaffPushNoticeAlarm } from "@/hooks/useStaffPushNoticeAlarm";
import { isDogHandlerComplaintNotice, getOwnerComplaintCategoryLabel, type StaffPushNotice } from "@/lib/staff/push-notices";

function NoticeIcon({ notice }: { notice: StaffPushNotice }) {
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
  const isBursting = useStaffPushNoticeAlarm(notice);
  const isDogHandler = isDogHandlerComplaintNotice(notice);

  return (
    <article
      className={`staff-push-notice staff-push-notice--alert ${isDogHandler ? "staff-push-notice--dog-handler" : ""} ${isBursting ? "staff-push-notice--burst" : ""} ${fullscreen ? "staff-push-notice--fullscreen" : ""}`}
      role="alert"
      aria-live="assertive"
    >
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

      <div className="staff-push-notice__paw staff-push-notice__paw--one" aria-hidden="true">
        <PawPrint />
      </div>
      <div className="staff-push-notice__paw staff-push-notice__paw--two" aria-hidden="true">
        <PawPrint />
      </div>

      <div className="staff-push-notice__icon" aria-hidden="true">
        <NoticeIcon notice={notice} />
      </div>
      <p className="staff-push-notice__eyebrow">{isDogHandler ? "Owner Complaint Alert" : "Yard Handler Alert"}</p>
      <h2 className="staff-push-notice__title">{notice.title}</h2>
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

export function StaffPushNoticeTvOverlay({ active }: { active: boolean }) {
  if (!active) return null;
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
  return (
    <aside className="staff-push-notice-panel staff-push-notice-panel--alert" aria-label="Active yard handler alert">
      <NoticeContent notice={notice} />
    </aside>
  );
}

export function StaffPushNoticeFullscreen({ notice }: { notice: StaffPushNotice }) {
  return (
    <section className="staff-push-notice-fullscreen staff-push-notice-fullscreen--alert" aria-label="Active yard handler alert">
      <NoticeContent notice={notice} fullscreen />
    </section>
  );
}
