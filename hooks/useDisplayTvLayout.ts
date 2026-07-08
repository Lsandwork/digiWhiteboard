"use client";

import { useEffect } from "react";
import {
  applyTvDisplayScale,
  clearTvDisplayScale,
  computeTvDisplayScale,
  TV_VIEWPORT_CONTENT
} from "@/lib/display-tv-layout";

export function useDisplayTvLayout(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewportMeta?.getAttribute("content") ?? null;

    const updateScale = () => {
      applyTvDisplayScale(computeTvDisplayScale(window.innerWidth, window.innerHeight));
    };

    document.documentElement.classList.add("fitdog-tv-active");
    viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT);
    updateScale();

    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      document.documentElement.classList.remove("fitdog-tv-active");
      clearTvDisplayScale();
      if (previousViewport) {
        viewportMeta?.setAttribute("content", previousViewport);
      }
    };
  }, [enabled]);
}
