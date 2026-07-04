"use client";

import { AlertTriangle, MapPinOff, PawPrint, PhoneOff } from "lucide-react";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

function NoticeIcon({ notice }: { notice: StaffPushNotice }) {
  const title = notice.title.toLowerCase();
  if (title.includes("phone")) return <PhoneOff />;
  if (title.includes("yard")) return <MapPinOff />;
  if (notice.priority === "urgent" || notice.display_mode === "urgent") return <AlertTriangle />;
  return <PawPrint />;
}

function priorityLabel(notice: StaffPushNotice) {
  if (notice.priority === "urgent" || notice.display_mode === "urgent") return "Urgent Handler Notice";
  if (notice.priority === "important") return "Important Handler Notice";
  return "Handler Notice";
}

function expiresLabel(notice: StaffPushNotice) {
  if (!notice.expires_at) return null;
  const date = new Date(notice.expires_at);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function NoticeContent({ notice, fullscreen = false }: { notice: StaffPushNotice; fullscreen?: boolean }) {
  const urgent = notice.priority === "urgent" || notice.display_mode === "urgent";

  return (
    <article className={`staff-push-notice ${urgent ? "staff-push-notice--urgent" : ""} ${fullscreen ? "staff-push-notice--fullscreen" : ""}`}>
      <div className="staff-push-notice__paw staff-push-notice__paw--one" aria-hidden="true">
        <PawPrint />
      </div>
      <div className="staff-push-notice__paw staff-push-notice__paw--two" aria-hidden="true">
        <PawPrint />
      </div>

      <div className="staff-push-notice__icon" aria-hidden="true">
        <NoticeIcon notice={notice} />
      </div>
      <p className="staff-push-notice__eyebrow">{priorityLabel(notice)}</p>
      <h2 className="staff-push-notice__title">{notice.title}</h2>
      {notice.message ? <p className="staff-push-notice__message">{notice.message}</p> : null}
      {expiresLabel(notice) ? <p className="staff-push-notice__expires">{expiresLabel(notice)}</p> : null}
    </article>
  );
}

export function StaffPushNoticePanel({ notice }: { notice: StaffPushNotice }) {
  return (
    <aside className="staff-push-notice-panel" aria-label="Active Push Notice">
      <NoticeContent notice={notice} />
    </aside>
  );
}

export function StaffPushNoticeFullscreen({ notice }: { notice: StaffPushNotice }) {
  return (
    <section className="staff-push-notice-fullscreen" aria-label="Active Push Notice">
      <NoticeContent notice={notice} fullscreen />
    </section>
  );
}
