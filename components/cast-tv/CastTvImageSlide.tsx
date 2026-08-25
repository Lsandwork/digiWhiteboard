"use client";

import { useEffect, useRef } from "react";
import type { CastTvObjectFit, CastTvPlaylistItem } from "@/lib/cast-tv/types";

type CastTvImageSlideProps = {
  item: CastTvPlaylistItem;
  active: boolean;
  objectFit: CastTvObjectFit;
  transitionMs: number;
  onError: () => void;
};

export function CastTvImageSlide({ item, active, objectFit, transitionMs, onError }: CastTvImageSlideProps) {
  const failTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
      return;
    }
    failTimerRef.current = window.setTimeout(() => {
      onError();
    }, 20_000);
    return () => {
      if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
    };
  }, [active, item.id, item.src, onError]);

  return (
    <div
      className={`cast-tv-slide cast-tv-slide--image ${active ? "is-active" : ""}`}
      style={{ transitionDuration: `${transitionMs}ms` }}
      aria-hidden={!active}
    >
      {/* Native img keeps slideshow photos compatible with TV browsers. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt=""
        className={`cast-tv-slide__media cast-tv-slide__media--${objectFit}`}
        style={{ objectFit }}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (failTimerRef.current) window.clearTimeout(failTimerRef.current);
        }}
        onError={onError}
      />
    </div>
  );
}
