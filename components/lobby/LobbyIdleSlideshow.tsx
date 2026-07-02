"use client";

import { useEffect, useState } from "react";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { LOBBY_IDLE_SLIDESHOW, LOBBY_SLIDESHOW_INTERVAL_MS } from "@/lib/lobby/slideshow";

export function LobbyIdleSlideshow({ tvMode = false }: { tvMode?: boolean }) {
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduceMotion || LOBBY_IDLE_SLIDESHOW.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % LOBBY_IDLE_SLIDESHOW.length);
    }, LOBBY_SLIDESHOW_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const slide = LOBBY_IDLE_SLIDESHOW[index];

  return (
    <section
      className={`lobby-idle-slideshow ${tvMode ? "lobby-idle-slideshow--tv" : ""}`}
      aria-label="Fitdog lobby promotions"
      aria-live="off"
    >
      <div className="lobby-idle-slideshow__frame">
        {LOBBY_IDLE_SLIDESHOW.map((item, itemIndex) => (
          <LobbyAssetImage
            key={item.src}
            src={item.src}
            alt={item.alt}
            width={1920}
            height={1080}
            fill
            priority={itemIndex === 0}
            className={`lobby-idle-slideshow__image ${itemIndex === index ? "is-active" : ""}`}
            sizes="(max-width: 1920px) 100vw, 1920px"
          />
        ))}
      </div>
      <div className="lobby-idle-slideshow__dots" aria-hidden>
        {LOBBY_IDLE_SLIDESHOW.map((item, itemIndex) => (
          <span key={item.src} className={itemIndex === index ? "is-active" : ""} />
        ))}
      </div>
      <p className="sr-only">{slide.alt}</p>
    </section>
  );
}
