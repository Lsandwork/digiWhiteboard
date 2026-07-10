"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  openAirPlayPicker,
  openChromecastPicker,
  openWirelessCastPicker,
  stopAllCastSessions,
  type CastPickerMethod
} from "@/lib/lobby/cast-picker";
import { isCastSenderSupported } from "@/lib/lobby/cast-platform";
import {
  getGoogleCastAppId,
  isGoogleCastSessionActive,
  preloadGoogleCast
} from "@/lib/lobby/google-cast";
import { buildStaffTvCastUrl } from "@/lib/lobby/tv-cast";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

type CastStatus = "idle" | "casting" | "error";

export function useStaffTvCast(displayToken = "") {
  const [castStatus, setCastStatus] = useState<CastStatus>("idle");
  const [castError, setCastError] = useState<string | null>(null);
  const [castMethod, setCastMethod] = useState<CastPickerMethod | null>(null);
  const isCasting = castStatus === "casting" || isGoogleCastSessionActive();
  const { requestWakeLock, releaseWakeLock } = useScreenWakeLock({
    enabled: isCasting,
    persistent: true,
    aggressive: true,
    renewIntervalMs: 10_000
  });
  const canCast = isCastSenderSupported();
  const castUrl = useMemo(() => buildStaffTvCastUrl(undefined, displayToken || undefined), [displayToken]);

  useEffect(() => {
    if (!canCast) return;
    void preloadGoogleCast();
    // Warm DNS/TLS for the cast page before the user picks a Chromecast device.
    try {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = castUrl;
      link.as = "document";
      document.head.appendChild(link);
    } catch {
      // Ignore prefetch failures.
    }
  }, [canCast, castUrl]);

  useEffect(() => {
    if (isCasting) {
      void requestWakeLock();
      return;
    }
    void releaseWakeLock();
  }, [isCasting, releaseWakeLock, requestWakeLock]);

  const beginCast = useCallback(
    async (method: CastPickerMethod) => {
      setCastError(null);
      if (method === "wireless") {
        await openWirelessCastPicker(displayToken || undefined, castUrl);
      } else if (method === "airplay") {
        await openAirPlayPicker();
      } else {
        await openChromecastPicker(displayToken || undefined, castUrl);
      }
      setCastMethod(method);
      setCastStatus("casting");
    },
    [castUrl, displayToken]
  );

  const stopTvCast = useCallback(async () => {
    setCastError(null);
    await stopAllCastSessions();
    await releaseWakeLock();
    setCastMethod(null);
    setCastStatus("idle");
  }, [releaseWakeLock]);

  const startChromecast = useCallback(async () => {
    if (!canCast) {
      throw new Error("Casting is not available in this browser.");
    }
    await beginCast("chromecast");
  }, [beginCast, canCast]);

  const startWirelessCast = useCallback(async () => {
    if (!canCast) {
      throw new Error("Casting is not available in this browser.");
    }
    await beginCast("wireless");
  }, [beginCast, canCast]);

  const startAirPlayCast = useCallback(async () => {
    if (!canCast) {
      throw new Error("Casting is not available in this browser.");
    }
    await beginCast("airplay");
  }, [beginCast, canCast]);

  const copyCastUrl = useCallback(async () => {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard is not available in this browser.");
    }
    await navigator.clipboard.writeText(castUrl);
  }, [castUrl]);

  const toggleTvCast = useCallback(async () => {
    if (isCasting) {
      await stopTvCast();
      return;
    }

    const result = await openChromecastPicker(displayToken || undefined, castUrl);
    setCastMethod(result.method);
    setCastStatus("casting");
  }, [castUrl, displayToken, isCasting, stopTvCast]);

  return {
    castUrl,
    isCasting,
    castError,
    castMethod,
    canCast,
    canChromecast: canCast,
    chromecastAppId: getGoogleCastAppId(),
    startChromecast,
    startWirelessCast,
    startAirPlayCast,
    copyCastUrl,
    toggleTvCast,
    stopTvCast,
    setCastError
  };
}
