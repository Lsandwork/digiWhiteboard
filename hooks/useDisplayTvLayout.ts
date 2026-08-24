"use client";

import { useLayoutEffect } from "react";
import {
  applyTvDisplayScale,
  applyTvStageToVisibleViewport,
  clearTvDisplayScale,
  clearTvStageBox,
  computeTvDisplayScale,
  measureTvViewport,
  TV_VIEWPORT_CONTENT
} from "@/lib/display-tv-layout";

export function useDisplayTvLayout(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const viewportMeta = document.querySelector("meta[name=\"viewport\"]");
    const previousViewport = viewportMeta?.getAttribute("content") ?? null;
    const root = document.documentElement;

    const updateScale = () => {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Hi-Browser may reject scroll while fullscreen.
      }
      viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT);
      const box = measureTvViewport(window);
      const stage = document.querySelector<HTMLElement>(".fitdog-tv-stage");
      if (stage) applyTvStageToVisibleViewport(stage, box);
      applyTvDisplayScale(computeTvDisplayScale(box.width, box.height));
    };

    root.classList.add("fitdog-tv-active");
    viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT);
    updateScale();

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    window.addEventListener("fullscreenchange", updateScale);
    visualViewport?.addEventListener("resize", updateScale);
    visualViewport?.addEventListener("scroll", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      window.removeEventListener("fullscreenchange", updateScale);
      visualViewport?.removeEventListener("resize", updateScale);
      visualViewport?.removeEventListener("scroll", updateScale);
      root.classList.remove("fitdog-tv-active");
      clearTvDisplayScale();
      document.querySelectorAll<HTMLElement>(".fitdog-tv-stage").forEach(clearTvStageBox);
      if (previousViewport) {
        viewportMeta?.setAttribute("content", previousViewport);
      }
    };
  }, [enabled]);
}
