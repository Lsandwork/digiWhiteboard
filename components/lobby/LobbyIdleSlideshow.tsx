"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { LOBBY_IDLE_SLIDESHOW, LOBBY_SLIDESHOW_INTERVAL_MS, type LobbySlideshowSlide } from "@/lib/lobby/slideshow";
import { useDisplaySync } from "@/hooks/useDisplaySync";

const defaultSlides: LobbySlideshowSlide[] = LOBBY_IDLE_SLIDESHOW.map((slide) => ({
  ...slide,
  mediaType: "image"
}));

function slideKey(slide: LobbySlideshowSlide, index: number) {
  return slide.id ?? `${slide.src}-${index}`;
}

export function LobbyIdleSlideshow({ tvMode = false }: { tvMode?: boolean }) {
  const [slides, setSlides] = useState<LobbySlideshowSlide[]>(defaultSlides);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const loadSlides = useCallback(async () => {
    try {
      const response = await fetch("/api/lobby/slideshow", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.slides) || !body.slides.length) return;
      setSlides(body.slides as LobbySlideshowSlide[]);
    } catch {
      // Keep the built-in slideshow if the API is unavailable.
    }
  }, []);

  useEffect(() => {
    void loadSlides();
  }, [loadSlides]);

  useDisplaySync({
    enabled: true,
    onContentUpdate: () => {
      void loadSlides();
    }
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setIndex((current) => (slides.length ? current % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (reduceMotion || slides.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, LOBBY_SLIDESHOW_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [reduceMotion, slides.length]);

  useEffect(() => {
    for (const [key, video] of Object.entries(videoRefs.current)) {
      if (!video) continue;
      const activeKey = slideKey(slides[index] ?? slides[0], index);
      if (key === activeKey) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [index, slides]);

  const slide = slides[index] ?? slides[0];

  return (
    <section
      className={`lobby-idle-slideshow ${tvMode ? "lobby-idle-slideshow--tv" : ""}`}
      aria-label="Fitdog lobby promotions"
      aria-live="off"
    >
      <div className="lobby-idle-slideshow__frame">
        {slides.map((item, itemIndex) => {
          const key = slideKey(item, itemIndex);
          const isActive = itemIndex === index;

          if (item.mediaType === "video") {
            return (
              <video
                key={key}
                ref={(node) => {
                  videoRefs.current[key] = node;
                }}
                src={item.src}
                poster={item.poster ?? undefined}
                className={`lobby-idle-slideshow__video ${isActive ? "is-active" : ""}`}
                muted
                playsInline
                loop
                preload="metadata"
              />
            );
          }

          return (
            <LobbyAssetImage
              key={key}
              src={item.src}
              alt={item.alt}
              width={1920}
              height={1080}
              fill
              priority={itemIndex === 0}
              className={`lobby-idle-slideshow__image ${isActive ? "is-active" : ""}`}
              sizes="(max-width: 1920px) 100vw, 1920px"
            />
          );
        })}
      </div>
      <div className="lobby-idle-slideshow__dots" aria-hidden>
        {slides.map((item, itemIndex) => (
          <span key={slideKey(item, itemIndex)} className={itemIndex === index ? "is-active" : ""} />
        ))}
      </div>
      {slide ? <p className="sr-only">{slide.alt}</p> : null}
    </section>
  );
}
