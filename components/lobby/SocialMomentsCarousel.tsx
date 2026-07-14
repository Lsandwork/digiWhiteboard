"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { SocialMomentsCacheBootstrap } from "@/components/lobby/SocialMomentsCacheBootstrap";
import { SOCIAL_MOMENTS, type SocialMoment } from "@/lib/lobby/social-moments";
import {
  getPrefetchedClipSrc,
  prefetchSocialMomentWindow,
  releaseSocialMomentPrefetchCache,
  SOCIAL_MOMENTS_PREFETCH_AHEAD
} from "@/lib/lobby/social-moments-prefetch";

const CROSSFADE_MS = 180;

type VideoSlot = 0 | 1;

function nextClipIndex(current: number, length: number) {
  return length ? (current + 1) % length : 0;
}

function upcomingIndices(startIndex: number, length: number, count: number) {
  if (!length) return [] as number[];
  const indices: number[] = [];
  for (let offset = 0; offset <= count; offset += 1) {
    indices.push((startIndex + offset) % length);
  }
  return indices;
}

export function SocialMomentsCarousel({
  paused = false,
  performanceMode = false
}: {
  paused?: boolean;
  performanceMode?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [slotIndices, setSlotIndices] = useState<[number, number]>([0, 1]);
  const [activeSlot, setActiveSlot] = useState<VideoSlot>(0);
  const [crossfading, setCrossfading] = useState(false);
  const [prefetchVersion, setPrefetchVersion] = useState(0);

  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const transitioningRef = useRef(false);
  const crossfadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    const initialTimer = window.setTimeout(() => {
      setMounted(true);
      update();
    }, 0);
    media.addEventListener("change", update);
    return () => {
      window.clearTimeout(initialTimer);
      media.removeEventListener("change", update);
      releaseSocialMomentPrefetchCache();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!paused) return;
    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    transitioningRef.current = false;
    const timer = window.setTimeout(() => setCrossfading(false), 0);
    for (const video of videoRefs.current) {
      video?.pause();
    }
    return () => window.clearTimeout(timer);
  }, [paused]);

  const clips = useMemo(
    () => SOCIAL_MOMENTS.filter((clip) => !failedIds.has(clip.id)),
    [failedIds]
  );

  const hasClips = clips.length > 0;
  const safeIndex = hasClips ? clipIndex % clips.length : 0;
  const currentClip = hasClips ? clips[safeIndex] : null;
  const staticPosterMode = reduceMotion || performanceMode;

  const currentSourceIndex = currentClip
    ? SOCIAL_MOMENTS.findIndex((clip) => clip.id === currentClip.id)
    : 0;

  useEffect(() => {
    if (clipIndex >= clips.length && clips.length > 0) {
      const timer = window.setTimeout(() => {
        setClipIndex(0);
        setSlotIndices([0, clips.length > 1 ? 1 : 0]);
        setActiveSlot(0);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [clipIndex, clips.length]);

  useEffect(() => {
    if (!hasClips || staticPosterMode || paused) return;
    let cancelled = false;
    void (async () => {
      await prefetchSocialMomentWindow(clips, safeIndex);
      if (!cancelled) setPrefetchVersion((value) => value + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [clips, hasClips, paused, safeIndex, staticPosterMode]);

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

  const waitForBufferedVideo = useCallback((video: HTMLVideoElement) => {
    return new Promise<void>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        resolve();
        return;
      }

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        video.removeEventListener("canplaythrough", onReady);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("canplaythrough", onReady);
      video.addEventListener("error", onError);
      video.load();
    });
  }, []);

  const beginCrossfade = useCallback(async (targetIndex: number) => {
    if (paused) return;
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

    const targetClip = clips[targetIndex];
    if (targetClip) {
      await prefetchSocialMomentWindow(clips, targetIndex);
    }

    await waitForBufferedVideo(inactiveVideo);

    setCrossfading(true);
    void playSlot(inactiveSlot);
    if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
    crossfadeTimerRef.current = window.setTimeout(() => {
      finishCrossfade(targetIndex, inactiveSlot);
    }, CROSSFADE_MS);
  }, [activeSlot, clips, finishCrossfade, paused, playSlot, safeIndex, waitForBufferedVideo]);

  const goNext = useCallback(() => {
    if (paused) return;
    if (!clips.length) return;
    if (staticPosterMode) {
      setClipIndex((current) => nextClipIndex(current, clips.length));
      return;
    }
    void beginCrossfade(nextClipIndex(safeIndex, clips.length));
  }, [beginCrossfade, clips.length, paused, safeIndex, staticPosterMode]);

  const goPrevious = useCallback(() => {
    if (paused) return;
    if (!clips.length) return;
    const target = (safeIndex - 1 + clips.length) % clips.length;
    if (staticPosterMode) {
      setClipIndex(target);
      return;
    }
    void beginCrossfade(target);
  }, [beginCrossfade, clips.length, paused, safeIndex, staticPosterMode]);

  const selectClip = useCallback((clipId: string) => {
    if (paused) return;
    const target = clips.findIndex((clip) => clip.id === clipId);
    if (target < 0) return;
    if (staticPosterMode) {
      setClipIndex(target);
      return;
    }
    void beginCrossfade(target);
  }, [beginCrossfade, clips, paused, staticPosterMode]);

  useEffect(() => {
    if (!mounted || staticPosterMode || !hasClips || paused) return;
    void playSlot(activeSlot);
  }, [activeSlot, hasClips, mounted, paused, playSlot, prefetchVersion, staticPosterMode, slotIndices]);

  const shouldPreloadSlot = useCallback(
    (slot: VideoSlot, clipIndexForSlot: number) => {
      if (slot === activeSlot) return true;
      return upcomingIndices(safeIndex, clips.length, SOCIAL_MOMENTS_PREFETCH_AHEAD).includes(clipIndexForSlot);
    },
    [activeSlot, clips.length, safeIndex]
  );

  const renderVideoSlot = (slot: VideoSlot) => {
    const clip = clips[slotIndices[slot]];
    if (!clip) return null;
    const inactiveSlot: VideoSlot = activeSlot === 0 ? 1 : 0;
    const isVisible = crossfading ? slot === inactiveSlot : slot === activeSlot;
    const preloadMode = shouldPreloadSlot(slot, slotIndices[slot]) ? "auto" : "metadata";

    return (
      <video
        ref={(node) => {
          videoRefs.current[slot] = node;
        }}
        className={`social-video-layer ${isVisible ? "social-video-layer--visible" : "social-video-layer--hidden"}`}
        src={getPrefetchedClipSrc(clip)}
        poster={clip.poster}
        autoPlay={slot === activeSlot && !crossfading && !paused}
        muted
        playsInline
        preload={preloadMode}
        onEnded={slot === activeSlot && !crossfading && !paused ? goNext : undefined}
        onError={() => {
          setFailedIds((current) => {
            const next = new Set(current);
            next.add(clip.id);
            return next;
          });
        }}
      />
    );
  };

  return (
    <section className="social-moments-card flex h-full min-h-0 flex-col" aria-label="Fitdog Social Moments">
      <SocialMomentsCacheBootstrap />

      <div className="social-moments-header">
        <div>
          <p className="social-moments-eyebrow">Social Media Moments</p>
          <h2>@fitdogclub</h2>
        </div>
        <div className="social-moments-paw" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/lobby-whiteboard/light-v2/icons/teal/social-heart-bubble-128.png" alt="" className="h-9 w-9 object-contain" />
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
        ) : currentClip && staticPosterMode ? (
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

      <div className="social-moments-footer">
        <span>Tag us @fitdogclub</span>
        <span className="social-moments-footer__icons" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/lobby-whiteboard/light-v2/icons/teal/instagram-128.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/lobby-whiteboard/light-v2/icons/teal/facebook-128.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/lobby-whiteboard/light-v2/icons/teal/tiktok-128.png" alt="" />
        </span>
        <span className="social-moments-footer__hash">#fitdogfamily</span>
      </div>

      <p className="sr-only">
        Video {currentSourceIndex + 1} of {SOCIAL_MOMENTS.length}
        {currentClip ? `: ${currentClip.title}` : ""}
      </p>
    </section>
  );
}
