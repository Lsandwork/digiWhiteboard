"use client";

import { Component, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Clock3, Dumbbell, MapPin, Megaphone, PawPrint, UserRound } from "lucide-react";
import {
  formatTrainerCountdown,
  trainerInstruction,
  trainerOwnerDisplayLabel,
  type TrainerPushNotice
} from "@/lib/staff/trainer-push-notices";
import { formatBoardDateTime } from "@/lib/board-utils";
import { groomingClockFromMs } from "@/components/board/GroomingPushNoticeOverlay";

type TrainerPushNoticeOverlayProps = {
  notice: TrainerPushNotice;
  queue: TrainerPushNotice[];
  nowMs: number;
  clockTime: string;
  clockDate: string;
};

class TrainerOverlayErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function DogPhoto({ notice }: { notice: TrainerPushNotice }) {
  const [failed, setFailed] = useState(false);
  const initial = notice.dog_name.trim().charAt(0).toUpperCase() || "?";

  if (notice.dog_photo_url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={notice.dog_photo_url} alt={notice.dog_name} className="grooming-push__photo-img" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    );
  }

  return (
    <div className="grooming-push__photo-fallback" aria-hidden>
      <span>{initial}</span>
    </div>
  );
}

function QueueCard({ notice }: { notice: TrainerPushNotice }) {
  const owner = trainerOwnerDisplayLabel(notice);
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

function TrainerPushNoticeContent({ notice, queue, nowMs, clockTime, clockDate }: TrainerPushNoticeOverlayProps) {
  const countdown = useMemo(() => formatTrainerCountdown(notice.expires_at, nowMs), [notice.expires_at, nowMs]);
  const owner = trainerOwnerDisplayLabel(notice);
  const requestedLabel = useMemo(() => {
    const date = new Date(notice.requested_at);
    if (Number.isNaN(date.getTime())) return "Requested recently";
    return `Requested at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, [notice.requested_at]);

  return (
    <section className="grooming-push grooming-push--alerting" role="alert" aria-live="assertive" aria-label={`Training request for ${notice.dog_name}`}>
      <div className="grooming-push__pulse" aria-hidden="true" />
      <div className="grooming-push__glow" aria-hidden="true" />
      <span className="grooming-push__flash-sweep" aria-hidden="true" />

      <header className="grooming-push__header">
        <div className="grooming-push__brand">
          <Image src="/assets/fitdog/replace_f-logo.png" alt="Fitdog" width={72} height={72} className="grooming-push__logo" priority />
          <div>
            <p className="grooming-push__brand-name">fitdog</p>
            <h1 className="grooming-push__title grooming-push__title--flash">Training Whiteboard</h1>
            <p className="grooming-push__subtitle">One-push training request for handlers.</p>
          </div>
        </div>
        <div className="grooming-push__clock">
          <p className="grooming-push__clock-time">{clockTime}</p>
          <p className="grooming-push__clock-date">{clockDate}</p>
          <span className="grooming-push__live-pill grooming-push__live-pill--flash">Live Request</span>
        </div>
      </header>

      <div className="grooming-push__layout">
        <div className="grooming-push__main-card grooming-push__main-card--flash">
          <div className="grooming-push__card-grid">
            <div className="grooming-push__photo-wrap grooming-push__photo-wrap--flash">
              <DogPhoto notice={notice} />
            </div>
            <div className="grooming-push__details">
              <p className="grooming-push__eyebrow">Bring to Training</p>
              <h2 className="grooming-push__dog-name grooming-push__dog-name--flash">{notice.dog_name.toUpperCase()}</h2>
              {owner ? <p className="grooming-push__owner">{owner.startsWith("Owner:") ? owner : `Owner: ${owner}`}</p> : null}
              <div className="grooming-push__meta-grid">
                <p><Dumbbell className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {notice.service}</p>
                <p><UserRound className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> Trainer: {notice.trainer_name}</p>
                <p><MapPin className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {notice.action}</p>
                <p><Clock3 className="inline h-4 w-4 text-fitdog-orange" aria-hidden /> {requestedLabel}</p>
              </div>
              {notice.notes ? <p className="grooming-push__notes">{notice.notes}</p> : null}
              {notice.safety_tags?.length ? (
                <div className="grooming-push__tags">
                  {notice.safety_tags.map((tag) => (
                    <span key={tag} className="grooming-push__tag"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grooming-push__countdown-wrap">
              <p className="grooming-push__countdown-label">Time Remaining</p>
              <div className="grooming-push__countdown grooming-push__countdown--flash">{countdown}</div>
              <p className="grooming-push__countdown-note">This request stays on screen for 5 minutes or until trainer clears it.</p>
            </div>
          </div>
          <div className="grooming-push__banner grooming-push__banner--flash">
            <Megaphone className="h-5 w-5 shrink-0 text-fitdog-orange" aria-hidden />
            <p>{trainerInstruction(notice)}</p>
          </div>
        </div>
      </div>

      <footer className="grooming-push__queue">
        <div className="grooming-push__queue-head">
          <PawPrint className="h-4 w-4 text-fitdog-orange" aria-hidden />
          <h3>Up Next — Upcoming Requests</h3>
        </div>
        <div className="grooming-push__queue-list">
          {queue.length ? queue.map((item) => <QueueCard key={item.id} notice={item} />) : (
            <p className="grooming-push__queue-empty">Only {notice.dog_name} is currently being pushed.</p>
          )}
        </div>
      </footer>
    </section>
  );
}

export function TrainerPushNoticeOverlay(props: TrainerPushNoticeOverlayProps) {
  return (
    <TrainerOverlayErrorBoundary>
      <TrainerPushNoticeContent {...props} />
    </TrainerOverlayErrorBoundary>
  );
}

export { groomingClockFromMs };
