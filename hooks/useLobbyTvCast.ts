"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildLobbyTvCastUrl,
  exitDocumentFullscreen,
  getPresentationRequestConstructor,
  isDocumentFullscreen,
  isFullscreenSupported,
  isPresentationCastSupported,
  requestDocumentFullscreen,
  type PresentationConnectionLike
} from "@/lib/lobby/tv-cast";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

type CastStatus = "idle" | "casting" | "error";

export function useLobbyTvCast(initialTvLayout = false) {
  const [tvLayoutActive, setTvLayoutActive] = useState(initialTvLayout);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [castStatus, setCastStatus] = useState<CastStatus>("idle");
  const [castError, setCastError] = useState<string | null>(null);
  const [presentationConnected, setPresentationConnected] = useState(false);
  const presentationConnectionRef = useRef<PresentationConnectionLike | null>(null);
  const { requestWakeLock, releaseWakeLock } = useScreenWakeLock();

  const isTvLayout = initialTvLayout || tvLayoutActive;
  const isCasting = castStatus === "casting" || isFullscreen || presentationConnected;
  const showCastActive = isCasting || isFullscreen;

  const syncFullscreenState = useCallback(() => {
    setIsFullscreen(isDocumentFullscreen());
  }, []);

  useEffect(() => {
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [syncFullscreenState]);

  const stopTvCast = useCallback(async () => {
    setCastError(null);

    const connection = presentationConnectionRef.current;
    presentationConnectionRef.current = null;
    setPresentationConnected(false);
    if (connection && connection.state !== "closed") {
      try {
        connection.close();
      } catch {
        // Ignore close failures.
      }
    }

    await exitDocumentFullscreen();
    await releaseWakeLock();
    setTvLayoutActive(false);
    setCastStatus("idle");
    syncFullscreenState();
  }, [releaseWakeLock, syncFullscreenState]);

  const startPresentationCast = useCallback(async () => {
    if (!isPresentationCastSupported()) return false;

    const PresentationRequestCtor = getPresentationRequestConstructor();
    if (!PresentationRequestCtor) return false;

    const request = new PresentationRequestCtor([buildLobbyTvCastUrl()]);
    const connection = await request.start();
    presentationConnectionRef.current = connection;
    setPresentationConnected(true);
    setCastStatus("casting");
    void requestWakeLock();

    connection.addEventListener("close", () => {
      if (presentationConnectionRef.current === connection) {
        presentationConnectionRef.current = null;
        setPresentationConnected(false);
        setCastStatus("idle");
      }
    });

    connection.addEventListener("terminate", () => {
      void stopTvCast();
    });

    return true;
  }, [requestWakeLock, stopTvCast]);

  const startLocalTvCast = useCallback(async () => {
    setTvLayoutActive(true);
    const enteredFullscreen = await requestDocumentFullscreen();
    if (enteredFullscreen) {
      setCastStatus("casting");
    } else {
      setCastStatus("idle");
    }
    await requestWakeLock();
    return enteredFullscreen;
  }, [requestWakeLock]);

  const openTvWindow = useCallback(() => {
    const tvUrl = buildLobbyTvCastUrl();
    const popup = window.open(tvUrl, "fitdog-lobby-tv", "noopener,noreferrer");
    if (!popup) return false;

    setCastStatus("casting");
    return true;
  }, []);

  const startTvCast = useCallback(async () => {
    setCastError(null);

    if (isPresentationCastSupported()) {
      try {
        const started = await startPresentationCast();
        if (started) return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start wireless cast.";
        const cancelled = /cancel|abort|denied/i.test(message);
        if (!cancelled) {
          setCastError(message);
        }
      }
    }

    if (isFullscreenSupported()) {
      const enteredFullscreen = await startLocalTvCast();
      if (enteredFullscreen) return;
    }

    const opened = openTvWindow();
    if (!opened) {
      setCastError("Pop-up blocked. Allow pop-ups, or open /lobby/checkouts?display=tv on the TV.");
    }
  }, [openTvWindow, startLocalTvCast, startPresentationCast]);

  const toggleTvCast = useCallback(async () => {
    if (isCasting) {
      await stopTvCast();
      return;
    }

    if (initialTvLayout || isTvLayout) {
      if (isFullscreen) {
        await exitDocumentFullscreen();
        await releaseWakeLock();
        return;
      }

      await startLocalTvCast();
      return;
    }

    await startTvCast();
  }, [initialTvLayout, isCasting, isFullscreen, isTvLayout, releaseWakeLock, startLocalTvCast, startTvCast, stopTvCast]);

  return {
    isTvLayout,
    isCasting,
    isFullscreen,
    showCastActive,
    castStatus,
    castError,
    canUsePresentation: isPresentationCastSupported(),
    canUseFullscreen: isFullscreenSupported(),
    startTvCast,
    stopTvCast,
    toggleTvCast
  };
}
