"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { SOCIAL_MOMENTS } from "@/lib/lobby/social-moments";

export function SocialMomentsCarousel() {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const clips = useMemo(
    () => SOCIAL_MOMENTS.filter((clip) => !failedIds.has(clip.id)),
    [failedIds]
  );

  const hasClips = clips.length > 0;
  const safeIndex = hasClips ? index % clips.length : 0;
  const currentClip = hasClips ? clips[safeIndex] : null;
  const currentSourceIndex = currentClip
    ? SOCIAL_MOMENTS.findIndex((clip) => clip.id === currentClip.id)
    : 0;

  useEffect(() => {
    if (index >= clips.length && clips.length > 0) {
      setIndex(0);
    }
  }, [clips.length, index]);

  const goNext = useCallback(() => {
    setIsReady(false);
    setIndex((current) => (clips.length ? (current + 1) % clips.length : 0));
  }, [clips.length]);

  const goPrevious = useCallback(() => {
    setIsReady(false);
    setIndex((current) => (clips.length ? (current - 1 + clips.length) % clips.length : 0));
  }, [clips.length]);

  const selectClip = useCallback((clipId: string) => {
    const clipIndex = clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex < 0) return;
    setIsReady(false);
    setIndex(clipIndex);
  }, [clips]);

  const handleError = useCallback(() => {
    if (!currentClip) return;
    setFailedIds((current) => {
      const next = new Set(current);
      next.add(currentClip.id);
      return next;
    });
    goNext();
  }, [currentClip, goNext]);

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

      <div className="social-video-shell">
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
        ) : currentClip ? (
          <video
            key={currentClip.id}
            className={isReady ? "social-video is-ready" : "social-video"}
            src={currentClip.src}
            poster={currentClip.poster}
            autoPlay
            muted
            playsInline
            preload="metadata"
            onCanPlay={() => setIsReady(true)}
            onEnded={goNext}
            onError={handleError}
          />
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
