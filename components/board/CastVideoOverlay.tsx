"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, Clock3, RefreshCw, Volume2, VolumeX } from "lucide-react";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import { castVideoAutoClearMs } from "@/lib/staff/cast-video-notices";
import { formatBoardDateTime } from "@/lib/board-utils";
import { trackCastVideoClose, trackCastVideoOpen } from "@/hooks/useCastVideoNotices";

type CastVideoOverlayProps = {
  notice: CastVideoNotice;
  queue: CastVideoNotice[];
  viewerKey: string;
  viewerRole?: string | null;
  viewerLocation?: string | null;
  onDismiss: () => void;
};

class CastVideoOverlayErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return formatBoardDateTime(date).time;
}

function CastVideoOverlayContent({
  notice,
  queue,
  viewerKey,
  viewerRole,
  viewerLocation,
  onDismiss
}: CastVideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const openedAtRef = useRef(Date.now());
  const [videoFailed, setVideoFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [watchedRequired, setWatchedRequired] = useState(false);
  const [closing, setClosing] = useState(false);

  const pushedLabel = useMemo(() => formatTimestamp(notice.pushed_at), [notice.pushed_at]);
  const autoClearMs = castVideoAutoClearMs(notice.auto_clear_mode);

  const dismiss = useCallback(
    async (options?: { acknowledged?: boolean; skipped?: boolean }) => {
      if (closing) return;
      setClosing(true);
      const watchDuration = Date.now() - openedAtRef.current;
      await trackCastVideoClose({
        notice_id: notice.id,
        viewer_key: viewerKey,
        watch_duration_ms: watchDuration,
        acknowledged: Boolean(options?.acknowledged),
        skipped: Boolean(options?.skipped)
      });
      onDismiss();
    },
    [closing, notice.id, onDismiss, viewerKey]
  );

  useEffect(() => {
    openedAtRef.current = Date.now();
    void trackCastVideoOpen({
      notice_id: notice.id,
      viewer_key: viewerKey,
      viewer_role: viewerRole ?? null,
      viewer_location: viewerLocation ?? null
    });
  }, [notice.id, viewerKey, viewerLocation, viewerRole]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoFailed) return;

    const tryPlay = async () => {
      try {
        video.muted = !notice.allow_sound || !soundEnabled;
        await video.play();
        setBuffering(false);
      } catch {
        setBuffering(false);
      }
    };

    void tryPlay();
  }, [notice.allow_sound, notice.id, retryNonce, soundEnabled, videoFailed]);

  useEffect(() => {
    if (!autoClearMs) return;
    const timer = window.setTimeout(() => {
      void dismiss({ skipped: !notice.require_acknowledgement });
    }, autoClearMs);
    return () => window.clearTimeout(timer);
  }, [autoClearMs, dismiss, notice.require_acknowledgement]);

  const handleClear = () => {
    if (notice.require_acknowledgement && !watchedRequired) return;
    void dismiss({ acknowledged: notice.require_acknowledgement, skipped: !notice.require_acknowledgement });
  };

  return (
    <section
      className={`cast-video ${closing ? "cast-video--closing" : "cast-video--entering"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Cast video: ${notice.title}`}
    >
      <div className="cast-video__backdrop" aria-hidden="true" />
      <div className="cast-video__frame">
        <header className="cast-video__header">
          <div className="cast-video__brand">
            <Image
              src="/assets/fitdog/replace_f-logo.png"
              alt="Fitdog"
              width={88}
              height={88}
              className="cast-video__logo"
              priority
            />
            <div>
              <p className="cast-video__brand-name">fitdog</p>
              <p className="cast-video__from">Message from Management</p>
            </div>
          </div>
          <div className="cast-video__meta">
            <p className="cast-video__title">{notice.title}</p>
            {notice.description ? <p className="cast-video__description">{notice.description}</p> : null}
            <p className="cast-video__timestamp">
              <Clock3 className="inline h-4 w-4" aria-hidden />
              {pushedLabel}
            </p>
          </div>
          {notice.allow_sound ? (
            <button
              type="button"
              className="cast-video__sound-btn"
              onClick={() => setSoundEnabled((current) => !current)}
              aria-label={soundEnabled ? "Mute video" : "Enable sound"}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          ) : null}
        </header>

        <div className="cast-video__player-wrap">
          {videoFailed ? (
            <div className="cast-video__fallback">
              {notice.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={notice.thumbnail_url} alt="" className="cast-video__fallback-thumb" />
              ) : null}
              <div className="cast-video__fallback-panel">
                <p className="cast-video__fallback-title">Video unavailable</p>
                <button
                  type="button"
                  className="cast-video__retry-btn"
                  onClick={() => {
                    setVideoFailed(false);
                    setBuffering(true);
                    setRetryNonce((value) => value + 1);
                  }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {buffering ? <div className="cast-video__buffering">Preparing video…</div> : null}
              <video
                key={`${notice.id}-${retryNonce}`}
                ref={videoRef}
                className="cast-video__player"
                src={notice.video_url ?? undefined}
                poster={notice.thumbnail_url ?? undefined}
                playsInline
                autoPlay
                muted={!notice.allow_sound || !soundEnabled}
                preload="auto"
                onCanPlay={() => setBuffering(false)}
                onWaiting={() => setBuffering(true)}
                onPlaying={() => setBuffering(false)}
                onError={() => setVideoFailed(true)}
              />
            </>
          )}
        </div>

        {queue.length ? (
          <footer className="cast-video__queue">
            <p className="cast-video__queue-label">Queued videos: {queue.length}</p>
          </footer>
        ) : null}

        <div className="cast-video__actions">
          {notice.require_acknowledgement ? (
            <button
              type="button"
              className={`cast-video__watch-btn ${watchedRequired ? "cast-video__watch-btn--done" : ""}`}
              onClick={() => setWatchedRequired(true)}
            >
              I&apos;ve Watched This
            </button>
          ) : null}
          <button
            type="button"
            className="cast-video__clear-btn"
            onClick={handleClear}
            disabled={notice.require_acknowledgement && !watchedRequired}
          >
            <Check className="h-5 w-5" aria-hidden />
            Clear Video
          </button>
        </div>
      </div>
    </section>
  );
}

export function CastVideoOverlay(props: CastVideoOverlayProps) {
  return (
    <CastVideoOverlayErrorBoundary>
      <CastVideoOverlayContent {...props} />
    </CastVideoOverlayErrorBoundary>
  );
}
