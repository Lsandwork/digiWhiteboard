"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { CastTvImageSlide } from "@/components/cast-tv/CastTvImageSlide";
import { CastTvVideoSlide } from "@/components/cast-tv/CastTvVideoSlide";
import { useCastTvPlaylist } from "@/components/cast-tv/useCastTvPlaylist";

type CastTvPlayerProps = {
  screenId?: string;
};

export function CastTvPlayer({ screenId = "default" }: CastTvPlayerProps) {
  const {
    playlist,
    settings,
    currentItem,
    nextItem,
    ready,
    advance,
    skipFailed,
    isPaused,
    isEmpty
  } = useCastTvPlaylist(screenId);

  const imageTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("cast-tv-root");
    document.body.classList.add("cast-tv-root");

    return () => {
      document.documentElement.classList.remove("cast-tv-root");
      document.body.classList.remove("cast-tv-root");
    };
  }, []);

  useEffect(() => {
    if (imageTimerRef.current) window.clearTimeout(imageTimerRef.current);

    if (!currentItem || isPaused || isEmpty) return;
    if (currentItem.mediaType !== "image") return;

    const durationMs = Math.max(1000, currentItem.imageDisplaySeconds * 1000);
    imageTimerRef.current = window.setTimeout(() => {
      advance();
    }, durationMs);

    return () => {
      if (imageTimerRef.current) window.clearTimeout(imageTimerRef.current);
    };
  }, [advance, currentItem, isEmpty, isPaused]);

  useEffect(() => {
    if (recoveryTimerRef.current) window.clearInterval(recoveryTimerRef.current);
    if (isPaused || isEmpty) return;

    recoveryTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") return;
      advance();
    }, 60_000);

    return () => {
      if (recoveryTimerRef.current) window.clearInterval(recoveryTimerRef.current);
    };
  }, [advance, isEmpty, isPaused]);

  useEffect(() => {
    if (!nextItem || nextItem.mediaType !== "image") return;
    const img = new window.Image();
    img.src = nextItem.src;
  }, [nextItem]);

  const transitionMs = settings.transition_style === "none" ? 0 : settings.transition_ms;
  const showStandby = ready && (isEmpty || isPaused);

  return (
    <main className="cast-tv-player" aria-label="CAST-TV slideshow">
      {showStandby ? (
        <div className="cast-tv-standby">
          {settings.show_standby_logo ? (
            <Image
              src="/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png"
              alt="Fitdog"
              width={160}
              height={160}
              priority
              className="cast-tv-standby__logo"
            />
          ) : null}
          <p className="cast-tv-standby__label">CAST-TV</p>
        </div>
      ) : null}

      {!showStandby
        ? playlist.map((item) => {
            const active = currentItem?.id === item.id;
            if (item.mediaType === "video") {
              return (
                <CastTvVideoSlide
                  key={item.id}
                  item={item}
                  active={active}
                  objectFit={settings.object_fit}
                  transitionMs={transitionMs}
                  onEnded={advance}
                  onError={skipFailed}
                />
              );
            }
            return (
              <CastTvImageSlide
                key={item.id}
                item={item}
                active={active}
                objectFit={settings.object_fit}
                transitionMs={transitionMs}
                onError={skipFailed}
              />
            );
          })
        : null}
    </main>
  );
}
