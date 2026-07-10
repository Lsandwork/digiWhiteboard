"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startDisplayKeepaliveFallback,
  stopDisplayKeepaliveFallback
} from "@/lib/display-keepalive-fallback";

type WakeLockStatus = "unsupported" | "active" | "released" | "error" | "idle";

export type UseScreenWakeLockOptions = {
  /** When false, the hook does not request or manage a wake lock. */
  enabled?: boolean;
  /** Keep the wake lock across React effect cleanups (display/TV mode). */
  persistent?: boolean;
  /** Renew wake lock periodically and run silent-video fallback when needed. */
  aggressive?: boolean;
  /** How often to re-request wake lock in aggressive mode. */
  renewIntervalMs?: number;
};

const DEFAULT_RENEW_MS = 15_000;

export function useScreenWakeLock(options: UseScreenWakeLockOptions = {}) {
  const {
    enabled = true,
    persistent = false,
    aggressive = false,
    renewIntervalMs = DEFAULT_RENEW_MS
  } = options;

  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const requestWakeLockRef = useRef<(() => Promise<void>) | null>(null);
  const stopFallbackRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<WakeLockStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!enabled || typeof window === "undefined") return;

    if (!("wakeLock" in navigator) || !navigator.wakeLock) {
      setStatus("unsupported");
      if (aggressive) {
        stopFallbackRef.current?.();
        stopFallbackRef.current = startDisplayKeepaliveFallback();
      }
      return;
    }

    try {
      if (sentinelRef.current && !sentinelRef.current.released) {
        setStatus("active");
        if (aggressive) {
          stopFallbackRef.current?.();
          stopFallbackRef.current = startDisplayKeepaliveFallback();
        }
        return;
      }

      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setStatus("active");
      setError(null);

      if (aggressive) {
        stopFallbackRef.current?.();
        stopFallbackRef.current = startDisplayKeepaliveFallback();
      }

      sentinel.addEventListener("release", () => {
        sentinelRef.current = null;
        setStatus("released");

        if (document.visibilityState === "visible") {
          window.setTimeout(() => {
            requestWakeLockRef.current?.().catch(() => {});
          }, 250);
        }
      });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Wake lock request failed");
      if (aggressive) {
        stopFallbackRef.current?.();
        stopFallbackRef.current = startDisplayKeepaliveFallback();
      }
    }
  }, [aggressive, enabled]);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (sentinelRef.current && !sentinelRef.current.released) {
        await sentinelRef.current.release();
      }
    } catch {
      // Do not crash the board if release fails.
    } finally {
      sentinelRef.current = null;
      setStatus("released");
      stopFallbackRef.current?.();
      stopFallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    requestWakeLockRef.current = requestWakeLock;
  }, [requestWakeLock]);

  useEffect(() => {
    if (!enabled) {
      const idleTimer = window.setTimeout(() => setStatus("idle"), 0);
      return () => window.clearTimeout(idleTimer);
    }

    const initialTimer = window.setTimeout(() => {
      void requestWakeLock();
    }, 0);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    const handlePageShow = () => {
      void requestWakeLock();
    };

    const handleFocus = () => {
      void requestWakeLock();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      if (!persistent) {
        void releaseWakeLock();
      }
    };
  }, [enabled, persistent, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    if (!enabled || !aggressive) return;

    const renewTimer = window.setInterval(() => {
      void requestWakeLock();
    }, renewIntervalMs);

    return () => {
      window.clearInterval(renewTimer);
    };
  }, [aggressive, enabled, renewIntervalMs, requestWakeLock]);

  useEffect(() => {
    if (!persistent) return;

    const handleUnload = () => {
      stopDisplayKeepaliveFallback();
    };

    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [persistent]);

  return {
    status,
    error,
    isSupported: status !== "unsupported",
    isActive: status === "active",
    requestWakeLock,
    releaseWakeLock
  };
}
