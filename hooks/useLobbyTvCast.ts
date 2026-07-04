"use client";

import { useCallback, useEffect, useState } from "react";
import { openChromecastPicker } from "@/lib/lobby/cast-picker";
import {
  getGoogleCastAppId,
  isGoogleCastBrowser,
  isGoogleCastSessionActive,
  preloadGoogleCast,
  stopGoogleCastSession
} from "@/lib/lobby/google-cast";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

export type CastMethod = "chromecast" | null;

type CastStatus = "idle" | "casting" | "error";

export function useLobbyTvCast(initialTvLayout = false, displayToken = "") {
  const [tvLayoutActive] = useState(initialTvLayout);
  const [castStatus, setCastStatus] = useState<CastStatus>("idle");
  const [castError, setCastError] = useState<string | null>(null);
  const [castMethod, setCastMethod] = useState<CastMethod>(null);
  const { requestWakeLock, releaseWakeLock } = useScreenWakeLock();

  const isTvLayout = initialTvLayout || tvLayoutActive;
  const canChromecast = isGoogleCastBrowser();
  const isCasting = castStatus === "casting" || isGoogleCastSessionActive();
  const showCastActive = isCasting;

  useEffect(() => {
    if (!canChromecast) return;
    void preloadGoogleCast();
  }, [canChromecast]);

  const stopTvCast = useCallback(async () => {
    setCastError(null);
    await stopGoogleCastSession();
    await releaseWakeLock();
    setCastMethod(null);
    setCastStatus("idle");
  }, [releaseWakeLock]);

  const startChromecast = useCallback(async () => {
    if (!canChromecast) {
      throw new Error("Casting requires Google Chrome on desktop.");
    }

    setCastError(null);
    await openChromecastPicker(displayToken || undefined);
    setCastMethod("chromecast");
    setCastStatus("casting");
    await requestWakeLock();
  }, [canChromecast, displayToken, requestWakeLock]);

  const toggleTvCast = useCallback(async () => {
    if (isCasting) {
      await stopTvCast();
      return;
    }

    await startChromecast();
  }, [isCasting, startChromecast, stopTvCast]);

  return {
    tvCastUrl: "/lobby/checkouts?display=tv",
    isTvLayout,
    isCasting,
    showCastActive,
    castStatus,
    castError,
    castMethod,
    canChromecast,
    chromecastAppId: getGoogleCastAppId(),
    toggleTvCast,
    setCastError
  };
}
