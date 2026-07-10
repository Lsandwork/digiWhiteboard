"use client";

import { useEffect, useRef } from "react";

type CastModeHealth = "live" | "reconnecting" | "offline";

type UseCastModeRuntimeOptions = {
  enabled: boolean;
  boardType: "staff" | "lobby";
  debugBoard?: boolean;
  health?: CastModeHealth;
  onFallbackRefresh?: () => void;
};

const CAST_FALLBACK_REFRESH_MS = 30 * 60 * 1000;
const CAST_STATIC_CACHE_NAME = "fitdog-cast-static-v1";
const CAST_STATIC_ASSETS = [
  "/assets/fitdog/replace_f-logo.png",
  "/assets/fitdog/brand/fitdog-logo-circle-badge-256.png",
  "/assets/fitdog-lobby-whiteboard/05-dog-placeholders/dog-profile-fallback-fitdog-logo.png",
  "/assets/fitdog/social-moments/social-moments.manifest.json",
  "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
  "/assets/fitdog/social-moments/posters/social-moment-02.jpg",
  "/assets/fitdog/social-moments/posters/social-moment-03.jpg"
] as const;

function debugCastLog(enabled: boolean | undefined, boardType: string, message: string, detail?: unknown) {
  if (!enabled) return;
  if (detail === undefined) {
    console.info(`[fitdog-cast:${boardType}] ${message}`);
    return;
  }
  console.info(`[fitdog-cast:${boardType}] ${message}`, detail);
}

async function cacheStaticAssets(debugBoard: boolean | undefined, boardType: string) {
  if (typeof window === "undefined" || !("caches" in window)) return;

  try {
    const cache = await window.caches.open(CAST_STATIC_CACHE_NAME);
    await cache.addAll(CAST_STATIC_ASSETS);
    debugCastLog(debugBoard, boardType, "cached static display assets", CAST_STATIC_ASSETS.length);
  } catch (error) {
    debugCastLog(debugBoard, boardType, "static asset cache skipped", error);
  }
}

export function useCastModeRuntime({
  enabled,
  boardType,
  debugBoard,
  health,
  onFallbackRefresh
}: UseCastModeRuntimeOptions) {
  const onFallbackRefreshRef = useRef(onFallbackRefresh);

  useEffect(() => {
    onFallbackRefreshRef.current = onFallbackRefresh;
  }, [onFallbackRefresh]);

  useEffect(() => {
    if (!enabled) return;

    document.documentElement.classList.add(
      "fitdog-cast-mode",
      "cast-performance-mode",
      "cast-lite-low-motion"
    );
    document.documentElement.dataset.castBoard = boardType;

    debugCastLog(debugBoard, boardType, "enabled");
    void cacheStaticAssets(debugBoard, boardType);

    return () => {
      document.documentElement.classList.remove(
        "fitdog-cast-mode",
        "cast-performance-mode",
        "cast-lite-low-motion"
      );
      delete document.documentElement.dataset.castBoard;
    };
  }, [boardType, debugBoard, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      debugCastLog(debugBoard, boardType, "30 minute fallback refresh");
      if (onFallbackRefreshRef.current) {
        onFallbackRefreshRef.current();
        return;
      }
      window.location.reload();
    }, CAST_FALLBACK_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [boardType, debugBoard, enabled]);

  useEffect(() => {
    if (!enabled) return;
    debugCastLog(debugBoard, boardType, "health changed", health);
  }, [boardType, debugBoard, enabled, health]);
}
