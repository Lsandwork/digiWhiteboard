"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import {
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  visibleStaffIdleSlideIndexes,
  type StaffIdleSlideshowSlide
} from "@/lib/staff/idle-slideshow";

const ASSET_BASE = "/assets/fitdog/staff-empty-state";

function FallbackEmptyCopy() {
  return (
    <>
      <div className="staff-board-empty-state__icon-wrap" aria-hidden="true">
        <Image
          src={`${ASSET_BASE}/fitdog-empty-in-out-icon.svg`}
          alt=""
          width={112}
          height={112}
          className="staff-board-empty-state__icon"
          priority
        />
      </div>

      <h2 className="staff-board-empty-state__headline">
        No dogs are currently checking{" "}
        <span className="staff-board-empty-state__accent">in / out.</span>
      </h2>

      <p className="staff-board-empty-state__support">
        Arrivals and departures will appear here automatically.
      </p>

      <div className="staff-board-empty-state__landscape" aria-hidden="true">
        <Image
          src={`${ASSET_BASE}/fitdog-empty-landscape-orange.svg`}
          alt=""
          width={960}
          height={280}
          className="staff-board-empty-state__landscape-art"
        />
      </div>

      <div className="staff-board-empty-state__paw" aria-hidden="true">
        <Image
          src={`${ASSET_BASE}/fitdog-empty-paw-divider.svg`}
          alt=""
          width={48}
          height={48}
          className="staff-board-empty-state__paw-icon"
        />
      </div>
    </>
  );
}

export function StaffBoardEmptyState() {
  const [slides, setSlides] = useState<StaffIdleSlideshowSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const loadSlides = useCallback(async () => {
    try {
      const response = await fetch("/api/staff/idle-slideshow", { cache: "no-store" });
      const body = (await response.json()) as { slides?: StaffIdleSlideshowSlide[] };
      const next = Array.isArray(body.slides) ? body.slides.filter((slide) => slide?.src) : [];
      setSlides(next);
    } catch {
      setSlides([]);
    } finally {
      setLoaded(true);
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
    }, STAFF_IDLE_SLIDESHOW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, slides.length]);

  const hasSlideshow = loaded && slides.length > 0;
  const active = slides[index] ?? slides[0];
  const visibleIndexes = visibleStaffIdleSlideIndexes(index, slides.length);

  return (
    <section
      className={`staff-board-empty-state ${hasSlideshow ? "staff-board-empty-state--slideshow" : ""}`}
      aria-label={hasSlideshow ? "Media library slideshow" : "No active check-ins or check-outs"}
      data-staff-board-layout="empty"
    >
      {hasSlideshow ? (
        <div className="staff-idle-slideshow" aria-live="off">
          <div className="staff-idle-slideshow__frame">
            {visibleIndexes.map((slideIndex) => {
              const slide = slides[slideIndex];
              if (!slide) return null;
              return (
                // Same-origin media proxy — <img> avoids Next image optimizer on TV.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={slide.id}
                  src={slide.src}
                  alt=""
                  className={`staff-idle-slideshow__image ${slideIndex === index ? "is-active" : ""}`}
                  decoding="async"
                />
              );
            })}
          </div>
          {active ? <p className="sr-only">{active.alt}</p> : null}
        </div>
      ) : (
        <>
          <div className="staff-board-empty-state__panel">
            {!loaded ? (
              <p className="staff-board-empty-state__support">Loading photos…</p>
            ) : (
              <FallbackEmptyCopy />
            )}
          </div>
          {loaded ? (
            <div className="staff-board-empty-state__quiet" role="status">
              <Image
                src={`${ASSET_BASE}/fitdog-empty-quiet-heart.svg`}
                alt=""
                width={28}
                height={28}
                className="staff-board-empty-state__quiet-icon"
                aria-hidden="true"
              />
              <div>
                <p className="staff-board-empty-state__quiet-title">All quiet right now</p>
                <p className="staff-board-empty-state__quiet-caption">
                  No active arrivals or departures at the moment.
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
