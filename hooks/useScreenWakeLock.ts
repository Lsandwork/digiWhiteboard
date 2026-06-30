"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockStatus = "unsupported" | "active" | "released" | "error" | "idle";

export function useScreenWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const requestWakeLockRef = useRef<(() => Promise<void>) | null>(null);
  const [status, setStatus] = useState<WakeLockStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (!("wakeLock" in navigator) || !navigator.wakeLock) {
      setStatus("unsupported");
      return;
    }

    try {
      if (sentinelRef.current && !sentinelRef.current.released) {
        setStatus("active");
        return;
      }

      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setStatus("active");
      setError(null);

      sentinel.addEventListener("release", () => {
        sentinelRef.current = null;
        setStatus("released");

        if (document.visibilityState === "visible") {
          window.setTimeout(() => {
            requestWakeLockRef.current?.().catch(() => {});
          }, 500);
        }
      });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Wake lock request failed");
    }
  }, []);

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
    }
  }, []);

  useEffect(() => {
    requestWakeLockRef.current = requestWakeLock;
  }, [requestWakeLock]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void requestWakeLock();
    }, 0);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return {
    status,
    error,
    isSupported: status !== "unsupported",
    isActive: status === "active",
    requestWakeLock,
    releaseWakeLock
  };
}
