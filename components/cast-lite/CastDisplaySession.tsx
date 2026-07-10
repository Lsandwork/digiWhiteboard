"use client";

import { useEffect } from "react";
import { useCastKeeperContext } from "@/hooks/useCastKeeper";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { startDisplayKeepaliveFallback } from "@/lib/display-keepalive-fallback";

const CAST_WAKE_RENEW_MS = 8_000;
const CAST_SESSION_TOUCH_MS = 30_000;

type CastDisplaySessionProps = {
  /** True when this tab is the Chromecast/TV receiver (not the laptop sender). */
  receiver?: boolean;
};

/**
 * Keeps cast display tabs awake: wake lock renewal, silent video fallback, and
 * periodic session touches so Cast Keeper never treats the display as stale.
 */
export function CastDisplaySession({ receiver = false }: CastDisplaySessionProps) {
  const castKeeper = useCastKeeperContext();

  useScreenWakeLock({
    enabled: true,
    persistent: true,
    aggressive: true,
    renewIntervalMs: CAST_WAKE_RENEW_MS
  });

  useEffect(() => {
    const stopKeepalive = startDisplayKeepaliveFallback();

    const touchSession = () => {
      castKeeper?.markDataFresh();
    };

    touchSession();
    const touchTimer = window.setInterval(touchSession, CAST_SESSION_TOUCH_MS);

    return () => {
      if (receiver) return;
      window.clearInterval(touchTimer);
      stopKeepalive();
    };
  }, [castKeeper, receiver]);

  return null;
}
