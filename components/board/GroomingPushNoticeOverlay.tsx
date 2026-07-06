"use client";

import { Component, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Clock3, MapPin, Megaphone, PawPrint, Scissors, UserRound } from "lucide-react";
import {
  formatGroomingCountdown,
  groomingInstruction,
  groomingStatusLabel,
  ownerDisplayLabel,
  parseGingrNoticeMeta,
  type GroomingPushNotice
} from "@/lib/staff/grooming-push-notices";
import { formatBoardDateTime } from "@/lib/board-utils";

type GroomingPushNoticeOverlayProps = {
  notice: GroomingPushNotice;
  queue: GroomingPushNotice[];
  nowMs: number;
  clockTime: string;
  clockDate: string;
};

class GroomingOverlayErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function DogPhoto({ notice }: { notice: GroomingPushNotice }) {
  const [failed, setFailed] = useState(false);
  const initial = notice.dog_name.trim().charAt(0).toUpperCase() || "?";

  if (notice.dog_photo_url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={notice.dog_photo_url}
        alt={notice.dog_name}
        className="grooming-push__photo-img"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="grooming-push__photo-fallback" aria-hidden>
      <span>{initial}</span>
    </div>
  );
}

function StatusStep({ label, detail, active, complete }: { label: string; detail: string; active?: boolean; complete?: boolean }) {
  return (
    <div className={`grooming-push__status-step ${active ? "grooming-push__status-step--active" : ""} ${complete ? "grooming-push__status-step--complete" : ""}`}>
      <span className="grooming-push__status-dot" aria-hidden />
      <div>
        <p className="grooming-push__status-label">{label}</p>
        <p className="grooming-push__status-detail">{detail}</p>
      </div>
    </div>
  );
}

function QueueCard({ notice }: { notice: GroomingPushNotice }) {
  const owner = ownerDisplayLabel(notice);
  return (
    <article className="grooming-push__queue-card">
      <div className="grooming-push__queue-photo" aria-hidden>
        {notice.dog_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={notice.dog_photo_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span>{notice.dog_name.charAt(0)}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="grooming-push__queue-name">{notice.dog_name}</p>
        <p className="grooming-push__queue-meta">{notice.service}{owner ? ` • ${owner}` : ""}</p>
      </div>
      <p className="grooming-push__queue-time">{new Date(notice.requested_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
    </article>
  );
}

function GroomingPushNoticeContent({ notice, queue, nowMs, clockTime, clockDate }: GroomingPushNoticeOverlayProps) {
  const countdown = useMemo(() => formatGroomingCountdown(notice.expires_at, nowMs), [notice.expires_at, nowMs]);
  const owner = ownerDisplayLabel(notice);
  const statusLabel = groomingStatusLabel(notice);
  const userNotes = notice.user_notes ?? parseGingrNoticeMeta(notice.notes).userNotes;
  const requestedLabel = useMemo(() => {
    const date = new Date(notice.requested_at);
    if (Number.isNaN(date.getTime())) return "Requested recently";
    return `Requested at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, [notice.requested_at]);

  return (
    <section className="grooming-push" role="alert" aria-live="assertive" aria-label={`Grooming request for ${notice.dog_name}`}>
      <div className="grooming-push__pulse" aria-hidden="true" />
      <div className="grooming-push__glow" aria-hidden="true" />

      <header className="grooming-push__header">
        <div className="grooming-push__brand">
          <Image
            src="/assets/fitdog/replace_f-logo.png"
            alt="Fitdog"
            width={72}
            height={72}
            className="grooming-push__logo"
            priority
          />
          <div>
            <p className="grooming-push__brand-name">fitdog</p>
            <h1 className="grooming-push__title">Grooming Push</h1>
            <p className="grooming-push__subtitle">Handler alert — bring dog to Catch for groomer.</p>
          </div>
        </div>
        <div className="grooming-push__clock">
          <p className="grooming-push__clock-time">{clockTime}</p>
          <p className="grooming-push__clock-date">{clockDate}</p>
          <span className="grooming-push__live-pill">Live Request</span>
        </div>
      </header>

      <div className="grooming-push__layout">
        <div className="grooming-push__main-card">
          <div className="grooming-push__card-grid">
            <div className="grooming-push__photo-wrap">
              <DogPhoto notice={notice} />
            </div>

            <div className="grooming-push__details">
              <p className="grooming-push__eyebrow">Grooming Push</p>
              <h2 className="grooming-push__dog-name">{notice.dog_name.toUpperCase()}</h2>
              {owner ? <p className="grooming-push__owner">{owner.startsWith("Owner:") ? owner : `Owner: ${owner}`}</p> : null}
              {statusLabel ? <p className="grooming-push__gingr-status">{statusLabel}</p> : null}

              <div className="grooming-push__meta-grid">
                <p><Scissors className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {notice.service}</p>
                <p><UserRound className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> Groomer: {notice.groomer_name}</p>
                <p><MapPin className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {notice.action}</p>
                <p><Clock3 className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {requestedLabel}</p>
              </div>

              {userNotes ? <p className="grooming-push__notes">{userNotes}</p> : null}

              {notice.safety_tags?.length ? (
                <div className="grooming-push__tags">
                  {notice.safety_tags.map((tag) => (
                    <span key={tag} className="grooming-push__tag">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grooming-push__countdown-wrap">
              <p className="grooming-push__countdown-label">Time Remaining</p>
              <div className="grooming-push__countdown">{countdown}</div>
              <p className="grooming-push__countdown-note">This request stays on screen for 5 minutes or until groomer clears it.</p>
            </div>
          </div>

          <div className="grooming-push__banner">
            <Megaphone className="h-5 w-5 shrink-0 text-fitdog-orange" aria-hidden />
            <p>{groomingInstruction(notice)}</p>
          </div>
        </div>

        <aside className="grooming-push__status-panel">
          <h3 className="grooming-push__status-title">Request Status</h3>
          <StatusStep label="Requested" detail={requestedLabel} complete active />
          <StatusStep label="Awaiting Handler Transfer" detail="Waiting for handler." active />
          <StatusStep label="Cleared" detail="Request complete." />
          <div className="grooming-push__status-callout">Awaiting Handler Transfer</div>
          <p className="grooming-push__status-footnote">Auto clears after 5 minutes if not manually cleared from the Grooming Push admin panel.</p>
        </aside>
      </div>

      <footer className="grooming-push__queue">
        <div className="grooming-push__queue-head">
          <PawPrint className="h-4 w-4 text-fitdog-orange" aria-hidden />
          <h3>Up Next — Upcoming Requests</h3>
        </div>
        <div className="grooming-push__queue-list">
          {queue.length ? queue.map((item) => <QueueCard key={item.id} notice={item} />) : (
            <p className="grooming-push__queue-empty">
              {queue.length === 0 ? `Only ${notice.dog_name} is currently being pushed.` : "No additional requests queued."}
            </p>
          )}
        </div>
      </footer>
    </section>
  );
}

export function GroomingPushNoticeOverlay(props: GroomingPushNoticeOverlayProps) {
  return (
    <GroomingOverlayErrorBoundary>
      <GroomingPushNoticeContent {...props} />
    </GroomingOverlayErrorBoundary>
  );
}

export function groomingClockFromMs(nowMs: number) {
  const formatted = formatBoardDateTime(new Date(nowMs));
  return { clockTime: formatted.time, clockDate: formatted.date };
}
