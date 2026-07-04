"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { SOCIAL_MOMENTS, type SocialMoment } from "@/lib/lobby/social-moments";

const CROSSFADE_MS = 180;

type VideoSlot = 0 | 1;

function nextClipIndex(current: number, length: number) {
  return length ? (current + 1) % length : 0;
}

export function SocialMomentsCarousel() {
  const [mounted, setMounted] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [slotIndices, setSlotIndices] = useState<[number, number]>([0, 1]);
  const [activeSlot, setActiveSlot] = useState<VideoSlot>(0);
  const [crossfading, setCrossfading] = useState(false);

  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const transitioningRef = useRef(false);
  const crossfadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
    };
  }, []);

  const clips = useMemo(
    () => SOCIAL_MOMENTS.filter((clip) => !failedIds.has(clip.id)),
    [failedIds]
  );

  const hasClips = clips.length > 0;
  const safeIndex = hasClips ? clipIndex % clips.length : 0;
  const currentClip = hasClips ? clips[safeIndex] : null;

  const currentSourceIndex = currentClip
    ? SOCIAL_MOMENTS.findIndex((clip) => clip.id === currentClip.id)
    : 0;

  useEffect(() => {
    if (clipIndex >= clips.length && clips.length > 0) {
      setClipIndex(0);
      setSlotIndices([0, clips.length > 1 ? 1 : 0]);
      setActiveSlot(0);
    }
  }, [clipIndex, clips.length]);

  const preloadClip = useCallback((clip: SocialMoment) => {
    if (typeof document === "undefined") return;
    const existing = document.querySelector(`link[data-social-preload="${clip.id}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "video";
    link.href = clip.src;
    link.setAttribute("data-social-preload", clip.id);
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!hasClips || reduceMotion) return;
    const upcoming = clips[nextClipIndex(safeIndex, clips.length)];
    if (upcoming) preloadClip(upcoming);
  }, [clips, hasClips, preloadClip, reduceMotion, safeIndex]);

  const playSlot = useCallback(async (slot: VideoSlot) => {
    const video = videoRefs.current[slot];
    if (!video) return;
    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      // Autoplay policies may reject; poster remains visible underneath.
    }
  }, []);

  const finishCrossfade = useCallback((nextIndex: number, nextSlot: VideoSlot) => {
    setClipIndex(nextIndex);
    setActiveSlot(nextSlot);
    setCrossfading(false);
    transitioningRef.current = false;

    const idleSlot: VideoSlot = nextSlot === 0 ? 1 : 0;
    const upcoming = nextClipIndex(nextIndex, clips.length);
    setSlotIndices((current) => {
      const copy: [number, number] = [...current];
      copy[idleSlot] = upcoming;
      return copy;
    });
  }, [clips.length]);

  const beginCrossfade = useCallback((targetIndex: number) => {
    if (!clips.length || transitioningRef.current) return;
    if (targetIndex === safeIndex) return;

    const inactiveSlot: VideoSlot = activeSlot === 0 ? 1 : 0;
    transitioningRef.current = true;

    setSlotIndices((current) => {
      const copy: [number, number] = [...current];
      copy[inactiveSlot] = targetIndex;
      return copy;
    });

    const inactiveVideo = videoRefs.current[inactiveSlot];
    if (!inactiveVideo) {
      setClipIndex(targetIndex);
      transitioningRef.current = false;
      return;
    }

    const startFade = () => {
      setCrossfading(true);
      void playSlot(inactiveSlot);
      if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = window.setTimeout(() => {
        finishCrossfade(targetIndex, inactiveSlot);
      }, CROSSFADE_MS);
    };

    if (inactiveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      startFade();
      return;
    }

    const onReady = () => {
      inactiveVideo.removeEventListener("canplay", onReady);
      startFade();
    };

    inactiveVideo.addEventListener("canplay", onReady);
    inactiveVideo.load();
  }, [activeSlot, clips.length, finishCrossfade, playSlot, safeIndex]);

  const goNext = useCallback(() => {
    if (!clips.length) return;
    if (reduceMotion) {
      setClipIndex((current) => nextClipIndex(current, clips.length));
      return;
    }
    beginCrossfade(nextClipIndex(safeIndex, clips.length));
  }, [beginCrossfade, clips.length, reduceMotion, safeIndex]);

  const goPrevious = useCallback(() => {
    if (!clips.length) return;
    const target = (safeIndex - 1 + clips.length) % clips.length;
    if (reduceMotion) {
      setClipIndex(target);
      return;
    }
    beginCrossfade(target);
  }, [beginCrossfade, clips.length, reduceMotion, safeIndex]);

  const selectClip = useCallback((clipId: string) => {
    const target = clips.findIndex((clip) => clip.id === clipId);
    if (target < 0) return;
    if (reduceMotion) {
      setClipIndex(target);
      return;
    }
    beginCrossfade(target);
  }, [beginCrossfade, clips, reduceMotion]);

  const handleError = useCallback((clip: SocialMoment) => {
    setFailedIds((current) => {
      const next = new Set(current);
      next.add(clip.id);
      return next;
    });
    if (clip.id === currentClip?.id) {
      goNext();
    }
  }, [currentClip?.id, goNext]);

  useEffect(() => {
    if (!mounted || reduceMotion || !hasClips) return;
    void playSlot(activeSlot);
  }, [activeSlot, hasClips, mounted, playSlot, reduceMotion, slotIndices]);

  const renderVideoSlot = (slot: VideoSlot) => {
    const clip = clips[slotIndices[slot]];
    if (!clip) return null;
    const inactiveSlot: VideoSlot = activeSlot === 0 ? 1 : 0;
    const isVisible = crossfading ? slot === inactiveSlot : slot === activeSlot;

    return (
      <video
        ref={(node) => {
          videoRefs.current[slot] = node;
        }}
        className={`social-video-layer ${isVisible ? "social-video-layer--visible" : "social-video-layer--hidden"}`}
        src={clip.src}
        poster={clip.poster}
        autoPlay={slot === activeSlot && !crossfading}
        muted
        playsInline
        preload={slot === activeSlot || slotIndices[slot] === nextClipIndex(safeIndex, clips.length) ? "auto" : "metadata"}
        onEnded={slot === activeSlot && !crossfading ? goNext : undefined}
        onError={() => handleError(clip)}
      />
    );
  };

  return (
    <section className="social-moments-card flex h-full min-h-0 flex-col" aria-label="Fitdog Social Moments">
      <div className="social-moments-header">
        <div>
          <p className="social-moments-eyebrow">Social Moments</p>
          <h2>From the Fitdog Pack</h2>
        </div>
        <div className="social-moments-paw" aria-hidden="true">
          🐾
        </div>
      </div>

      <div className={`social-video-shell ${crossfading ? "social-video-shell--crossfading" : ""}`}>
        {currentClip ? (
          <Image
            src={currentClip.poster}
            alt=""
            fill
            className="social-video-poster object-cover"
            sizes="(max-width: 768px) 100vw, 390px"
            priority
          />
        ) : null}

        {!mounted ? (
          <Image
            src={SOCIAL_MOMENTS[0].poster}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 390px"
            priority
          />
        ) : currentClip && reduceMotion ? (
          <div className="social-video-static">
            <Image
              src={currentClip.poster}
              alt={currentClip.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 390px"
            />
            <div className="social-video-static-controls">
              <button type="button" className="social-moments-nav-btn" onClick={goPrevious} aria-label="Previous video">
                Previous
              </button>
              <button type="button" className="social-moments-nav-btn" onClick={goNext} aria-label="Next video">
                Next
              </button>
            </div>
          </div>
        ) : hasClips ? (
          <div className="social-video-stack">
            {renderVideoSlot(0)}
            {clips.length > 1 ? renderVideoSlot(1) : null}
          </div>
        ) : (
          <div className="social-video-fallback">
            <span aria-hidden="true">🐾</span>
            <strong>Social Moments</strong>
            <p>Fitdog videos are loading.</p>
          </div>
        )}
      </div>

      <div className="social-moments-dots">
        {SOCIAL_MOMENTS.map((clip) => {
          const unavailable = failedIds.has(clip.id);
          const isActive = clip.id === currentClip?.id;
          return (
            <button
              key={clip.id}
              type="button"
              aria-label={`Show ${clip.title}`}
              aria-current={isActive ? "true" : undefined}
              disabled={unavailable}
              className={`social-moments-dot ${isActive ? "social-moments-dot--active" : ""} ${unavailable ? "social-moments-dot--disabled" : ""}`}
              onClick={() => selectClip(clip.id)}
            />
          );
        })}
      </div>

      <p className="sr-only">
        Video {currentSourceIndex + 1} of {SOCIAL_MOMENTS.length}
        {currentClip ? `: ${currentClip.title}` : ""}
      </p>
    </section>
  );
}
