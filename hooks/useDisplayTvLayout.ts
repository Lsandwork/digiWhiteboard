"use client";

import { useLayoutEffect } from "react";
import {
  applyTvDisplayScale,
  applyTvStageToVisibleViewport,
  clearTvDisplayScale,
  clearTvStageBox,
  computeTvDisplayScale,
  isFullyKioskBrowser,
  measureTvViewport,
  resetTvBrowserZoom,
  TV_VIEWPORT_CONTENT,
  TV_VIEWPORT_CONTENT_KIOSK_LOCKED
} from "@/lib/display-tv-layout";

export function useDisplayTvLayout(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const viewportMeta = document.querySelector("meta[name=\"viewport\"]");
    const previousViewport = viewportMeta?.getAttribute("content") ?? null;
    const root = document.documentElement;
    let remountTimer: ReturnType<typeof setTimeout> | null = null;

    const updateScale = () => {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Hi-Browser may reject scroll while fullscreen.
      }

      const fullyKiosk = isFullyKioskBrowser(window);
      if (fullyKiosk) {
        resetTvBrowserZoom(window);
        root.classList.add("fitdog-tv-kiosk");
        viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT_KIOSK_LOCKED);
      } else {
        root.classList.remove("fitdog-tv-kiosk");
        viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT);
      }

      const box = measureTvViewport(window);
      const stage = document.querySelector<HTMLElement>(".fitdog-tv-stage");
      if (stage) applyTvStageToVisibleViewport(stage, box);
      // After CSS kiosk locks (inset:0), prefer the stage's rendered box so
      // --fitdog-tv-scale matches what the TV is actually painting.
      const scaleW = stage?.clientWidth || box.width;
      const scaleH = stage?.clientHeight || box.height;
      applyTvDisplayScale(computeTvDisplayScale(scaleW, scaleH));
    };

    root.classList.add("fitdog-tv-active");
    updateScale();
    // Fully Kiosk often reports the wrong size on the first paint / before
    // fullscreen settles — remeasure shortly after mount.
    remountTimer = setTimeout(updateScale, 250);
    const remountTimer2 = setTimeout(updateScale, 1000);

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    window.addEventListener("fullscreenchange", updateScale);
    visualViewport?.addEventListener("resize", updateScale);
    visualViewport?.addEventListener("scroll", updateScale);

    return () => {
      if (remountTimer) clearTimeout(remountTimer);
      clearTimeout(remountTimer2);
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      window.removeEventListener("fullscreenchange", updateScale);
      visualViewport?.removeEventListener("resize", updateScale);
      visualViewport?.removeEventListener("scroll", updateScale);
      root.classList.remove("fitdog-tv-active");
      root.classList.remove("fitdog-tv-kiosk");
      clearTvDisplayScale();
      document.querySelectorAll<HTMLElement>(".fitdog-tv-stage").forEach(clearTvStageBox);
      if (previousViewport) {
        viewportMeta?.setAttribute("content", previousViewport);
      }
    };
  }, [enabled]);
}
