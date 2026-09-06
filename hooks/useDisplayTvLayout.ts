"use client";

import { useLayoutEffect } from "react";
import {
  applyTvDisplayScale,
  applyTvStageToVisibleViewport,
  clearTvDisplayScale,
  clearTvStageBox,
  collectTvLayoutDiagnostics,
  computeTvDisplayScale,
  logTvLayoutDiagnostics,
  measureTvFitViewport,
  measureTvViewport,
  resetTvBrowserZoom,
  shouldLockTvKioskViewport,
  TV_VIEWPORT_CONTENT,
  TV_VIEWPORT_CONTENT_KIOSK_LOCKED
} from "@/lib/display-tv-layout";

function tvDebugEnabled() {
  try {
    return new URLSearchParams(window.location.search).get("tvDebug") === "1";
  } catch {
    return false;
  }
}

/**
 * Scales the fixed 1920×1080 TV canvas into the visible viewport.
 *
 * Cast-TV fills `inset:0` so Fully page-zoom still looks full-bleed. Lobby
 * must keep the designed canvas, so we:
 * 1) reset Fully/WebView zoom
 * 2) keep the stage full-bleed (never stamp into a VV corner)
 * 3) compute scale from the *fit* viewport (visible CSS area), not only layout
 */
export function useDisplayTvLayout(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewportMeta?.getAttribute("content") ?? null;
    const root = document.documentElement;
    const debug = tvDebugEnabled();
    let remountTimer: ReturnType<typeof setTimeout> | null = null;

    const updateScale = () => {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Some TV browsers reject scroll while fullscreen.
      }

      // Fully / Android WebView / Hi-Browser page zoom is the root cause of the
      // lobby "zoomed in" crop — always attempt a reset before measuring.
      resetTvBrowserZoom(window);

      const lockKiosk = shouldLockTvKioskViewport(window);
      if (lockKiosk) {
        root.classList.add("fitdog-tv-kiosk");
        viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT_KIOSK_LOCKED);
      } else {
        root.classList.remove("fitdog-tv-kiosk");
        viewportMeta?.setAttribute("content", TV_VIEWPORT_CONTENT);
      }

      // Stage: full-bleed shell (casttv inset:0 pattern under kiosk CSS).
      const stageBox = measureTvViewport(window);
      const stage = document.querySelector<HTMLElement>(".fitdog-tv-stage");
      if (stage) applyTvStageToVisibleViewport(stage, stageBox);

      // Fit: largest 16:9 canvas that fits the *visible* area (handles Fully zoom).
      const fitBox = measureTvFitViewport(window);
      const stageW = stage?.clientWidth || stageBox.width;
      const stageH = stage?.clientHeight || stageBox.height;
      // Prefer the smaller of painted stage vs fit box so we never overflow.
      const scaleW = Math.min(stageW, fitBox.width);
      const scaleH = Math.min(stageH, fitBox.height);
      const scale = computeTvDisplayScale(scaleW, scaleH);
      applyTvDisplayScale(scale);

      if (debug) {
        logTvLayoutDiagnostics(
          collectTvLayoutDiagnostics(window, stageW, stageH, fitBox, scale)
        );
      }
    };

    root.classList.add("fitdog-tv-active");
    updateScale();
    // TV browsers often report the wrong size on first paint / before
    // fullscreen settles — remeasure shortly after mount.
    remountTimer = setTimeout(updateScale, 250);
    const remountTimer2 = setTimeout(updateScale, 1000);
    const remountTimer3 = setTimeout(updateScale, 2500);

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    window.addEventListener("fullscreenchange", updateScale);
    visualViewport?.addEventListener("resize", updateScale);
    visualViewport?.addEventListener("scroll", updateScale);

    return () => {
      if (remountTimer) clearTimeout(remountTimer);
      clearTimeout(remountTimer2);
      clearTimeout(remountTimer3);
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
