"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, Clock3, RefreshCw, Volume2, VolumeX } from "lucide-react";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import { castVideoAutoClearMs, isYouTubeEmbedCastVideo } from "@/lib/staff/cast-video-notices";
import { isYardPushCastNotice, yardPushSideFromNotice, yardPushSideLabel, YARD_PUSH_SIDE_OPTIONS } from "@/lib/staff/yard-push-notices";
import { YARD_LINK_FEEDS } from "@/lib/yard-links/config";
import { buildYouTubeCastEmbedUrl } from "@/lib/yard-links/youtube";
import { formatBoardDateTime } from "@/lib/board-utils";
import { trackCastVideoClose, trackCastVideoOpen } from "@/hooks/useCastVideoNotices";

type CastVideoOverlayProps = {
  notice: CastVideoNotice;
  queue: CastVideoNotice[];
  viewerKey: string;
  viewerRole?: string | null;
  viewerLocation?: string | null;
  /** Staff whiteboard: auto-minimize instead of manual clear. */
  boardMode?: boolean;
  minimized?: boolean;
  onMinimize?: () => void;
  onDismiss: () => void;
};

const BOARD_AUTO_MINIMIZE_MS = 10_000;

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

function resolveYardPushEmbedUrl(notice: CastVideoNotice) {
  const side = yardPushSideFromNotice(notice);
  if (!side) return null;
  const option = YARD_PUSH_SIDE_OPTIONS.find((item) => item.id === side);
  const feed = YARD_LINK_FEEDS.find((item) => item.title === option?.feedTitle);
  if (!feed) return null;
  return buildYouTubeCastEmbedUrl(feed.videoId, { muted: true });
}

function CastVideoOverlayContent({
  notice,
  queue,
  viewerKey,
  viewerRole,
  viewerLocation,
  boardMode = false,
  minimized = false,
  onMinimize,
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
  const isYouTubeCast = isYouTubeEmbedCastVideo(notice) || isYardPushCastNotice(notice);
  const yardSideLabel = yardPushSideLabel(yardPushSideFromNotice(notice));
  const displayDescription = useMemo(() => {
    if (yardSideLabel) return `${yardSideLabel} yard live camera`;
    const description = notice.description?.trim();
    if (!description || description.startsWith("yard_push:")) return null;
    return description;
  }, [notice.description, yardSideLabel]);
  const youtubeSrc = useMemo(() => {
    if (!isYouTubeCast) return notice.video_url ?? undefined;
    let base = notice.video_url ?? undefined;
    if (!base || !/youtube\.com\/embed\//i.test(base)) {
      base = resolveYardPushEmbedUrl(notice) ?? base;
    }
    if (!base) return undefined;
    try {
      const url = new URL(base);
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("mute", notice.allow_sound && soundEnabled ? "0" : "1");
      return url.toString();
    } catch {
      return base;
    }
  }, [isYouTubeCast, notice, soundEnabled]);

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
    if (!video || videoFailed || isYouTubeCast) return;

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
  }, [isYouTubeCast, notice.allow_sound, notice.id, retryNonce, soundEnabled, videoFailed]);

  useEffect(() => {
    if (!autoClearMs || boardMode) return;
    const timer = window.setTimeout(() => {
      void dismiss({ skipped: !notice.require_acknowledgement });
    }, autoClearMs);
    return () => window.clearTimeout(timer);
  }, [autoClearMs, boardMode, dismiss, notice.require_acknowledgement]);

  useEffect(() => {
    if (!boardMode || minimized || notice.require_acknowledgement) return;
    const timer = window.setTimeout(() => onMinimize?.(), BOARD_AUTO_MINIMIZE_MS);
    return () => window.clearTimeout(timer);
  }, [boardMode, minimized, notice.id, notice.require_acknowledgement, onMinimize]);

  useEffect(() => {
    if (!boardMode || minimized || !notice.require_acknowledgement || !watchedRequired) return;
    const timer = window.setTimeout(() => onMinimize?.(), 2500);
    return () => window.clearTimeout(timer);
  }, [boardMode, minimized, notice.require_acknowledgement, onMinimize, watchedRequired]);

  const handleClear = () => {
    if (boardMode) return;
    if (notice.require_acknowledgement && !watchedRequired) return;
    void dismiss({ acknowledged: notice.require_acknowledgement, skipped: !notice.require_acknowledgement });
  };

  return (
    <section
      className={`cast-video cast-video--alerting ${minimized ? "cast-video--minimized" : ""} ${closing ? "cast-video--closing" : minimized ? "" : "cast-video--entering"}`}
      role={minimized ? "complementary" : "dialog"}
      aria-modal={minimized ? undefined : true}
      aria-label={`Cast video: ${notice.title}`}
    >
      {!minimized ? (
        <>
          <div className="cast-video__pulse" aria-hidden="true" />
          <div className="cast-video__glow" aria-hidden="true" />
          <span className="cast-video__flash-sweep" aria-hidden="true" />
        </>
      ) : (
        <>
          <div className="cast-video__pip-pulse" aria-hidden="true" />
          <div className="cast-video__pip-glow" aria-hidden="true" />
        </>
      )}
      {!minimized ? <div className="cast-video__backdrop" aria-hidden="true" /> : null}
      <div className={`cast-video__frame ${minimized ? "cast-video__frame--minimized" : ""}`}>
        <header className={`cast-video__header ${minimized ? "cast-video__header--minimized" : ""}`}>
          {!minimized ? (
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
                <p className="cast-video__from">{yardSideLabel ? "Yard Push Notice" : "Message from Management"}</p>
              </div>
            </div>
          ) : (
            <div className="cast-video__pip-brand">
              <Image
                src="/assets/fitdog/replace_f-logo.png"
                alt="Fitdog"
                width={36}
                height={36}
                className="cast-video__pip-logo"
              />
              <div className="cast-video__pip-meta">
                <p className="cast-video__pip-title">{notice.title}</p>
                <p className="cast-video__pip-subtitle">
                  {yardSideLabel ? "Yard Push · Live" : "Cast Video · Live"}
                </p>
              </div>
            </div>
          )}
          {!minimized ? (
            <div className="cast-video__meta">
              <p className="cast-video__title">{notice.title}</p>
              {displayDescription ? <p className="cast-video__description">{displayDescription}</p> : null}
              <p className="cast-video__timestamp">
                <Clock3 className="inline h-4 w-4" aria-hidden />
                {pushedLabel}
              </p>
            </div>
          ) : null}
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

        <div className={`cast-video__player-wrap ${minimized ? "cast-video__player-wrap--minimized" : ""}`}>
          {isYouTubeCast ? (
            <>
              {buffering ? <div className="cast-video__buffering">Loading yard camera…</div> : null}
              <iframe
                key={`${notice.id}-${soundEnabled ? "sound" : "muted"}-${retryNonce}`}
                src={youtubeSrc}
                title={notice.title}
                className="cast-video__player cast-video__player--youtube"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                onLoad={() => {
                  setBuffering(false);
                  setVideoFailed(false);
                }}
              />
            </>
          ) : videoFailed ? (
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

        {!minimized && queue.length ? (
          <footer className="cast-video__queue">
            <p className="cast-video__queue-label">Queued videos: {queue.length}</p>
          </footer>
        ) : null}

        {!boardMode ? (
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
        ) : !minimized && notice.require_acknowledgement ? (
          <div className="cast-video__actions">
            <button
              type="button"
              className={`cast-video__watch-btn ${watchedRequired ? "cast-video__watch-btn--done" : ""}`}
              onClick={() => setWatchedRequired(true)}
            >
              I&apos;ve Watched This
            </button>
          </div>
        ) : !minimized ? (
          <p className="cast-video__board-hint">Minimizing to corner view so the board stays visible…</p>
        ) : null}
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
