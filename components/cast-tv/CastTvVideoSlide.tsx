"use client";

import { useEffect, useRef } from "react";
import type { CastTvObjectFit, CastTvPlaylistItem } from "@/lib/cast-tv/types";
import { CAST_TV_MEDIA_FAIL_TIMEOUT_MS } from "@/lib/cast-tv/types";

type CastTvVideoSlideProps = {
  item: CastTvPlaylistItem;
  active: boolean;
  objectFit: CastTvObjectFit;
  transitionMs: number;
  onEnded: () => void;
  onError: () => void;
};

export function CastTvVideoSlide({
  item,
  active,
  objectFit,
  transitionMs,
  onEnded,
  onError
}: CastTvVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const failTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active) {
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise) {
        void playPromise.catch(() => {
          window.setTimeout(() => {
            void video.play().catch(() => onError());
          }, 400);
        });
      }

      if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
      failTimerRef.current = window.setTimeout(() => {
        if (video.readyState < 2) onError();
      }, CAST_TV_MEDIA_FAIL_TIMEOUT_MS);
    } else {
      video.pause();
      video.currentTime = 0;
      if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
    }

    return () => {
      if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
    };
  }, [active, item.id, item.src, onError]);

  return (
    <div
      className={`cast-tv-slide cast-tv-slide--video ${active ? "is-active" : ""}`}
      style={{ transitionDuration: `${transitionMs}ms` }}
      aria-hidden={!active}
    >
      <video
        ref={videoRef}
        className={`cast-tv-slide__media cast-tv-slide__media--${objectFit}`}
        style={{ objectFit }}
        src={item.src}
        autoPlay
        muted
        playsInline
        controls={false}
        preload="auto"
        onEnded={onEnded}
        onError={onError}
        onStalled={() => {
          const video = videoRef.current;
          if (!video || !active) return;
          void video.play().catch(() => onError());
        }}
      />
    </div>
  );
}
