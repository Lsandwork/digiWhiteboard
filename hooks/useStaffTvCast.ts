"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { openChromecastPicker } from "@/lib/lobby/cast-picker";
import {
  getGoogleCastAppId,
  isGoogleCastBrowser,
  isGoogleCastSessionActive,
  preloadGoogleCast,
  stopGoogleCastSession
} from "@/lib/lobby/google-cast";
import { buildStaffTvCastUrl } from "@/lib/lobby/tv-cast";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

type CastStatus = "idle" | "casting" | "error";

export function useStaffTvCast(displayToken = "") {
  const [castStatus, setCastStatus] = useState<CastStatus>("idle");
  const [castError, setCastError] = useState<string | null>(null);
  const { requestWakeLock, releaseWakeLock } = useScreenWakeLock();
  const canChromecast = isGoogleCastBrowser();
  const isCasting = castStatus === "casting" || isGoogleCastSessionActive();
  const castUrl = useMemo(() => buildStaffTvCastUrl(undefined, displayToken || undefined), [displayToken]);

  useEffect(() => {
    if (!canChromecast) return;
    void preloadGoogleCast();
  }, [canChromecast]);

  const stopTvCast = useCallback(async () => {
    setCastError(null);
    await stopGoogleCastSession();
    await releaseWakeLock();
    setCastStatus("idle");
  }, [releaseWakeLock]);

  const startChromecast = useCallback(async () => {
    if (!canChromecast) {
      throw new Error("Casting requires Google Chrome on desktop.");
    }

    setCastError(null);
    await openChromecastPicker(displayToken || undefined, castUrl);
    setCastStatus("casting");
    await requestWakeLock();
  }, [canChromecast, castUrl, displayToken, requestWakeLock]);

  const toggleTvCast = useCallback(async () => {
    if (isCasting) {
      await stopTvCast();
      return;
    }

    await startChromecast();
  }, [isCasting, startChromecast, stopTvCast]);

  return {
    castUrl,
    isCasting,
    castError,
    canChromecast,
    chromecastAppId: getGoogleCastAppId(),
    toggleTvCast,
    setCastError
  };
}
