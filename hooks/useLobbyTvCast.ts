"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAirPlayCastActive,
  isAirPlayPickerSupported,
  isAppleDevice,
  isDisplayMediaSupported,
  startAirPlayCast,
  stopAirPlayCast
} from "@/lib/lobby/airplay-cast";
import {
  getGoogleCastAppId,
  isGoogleCastConfigured,
  isGoogleCastSessionActive,
  startGoogleCastSession,
  stopGoogleCastSession
} from "@/lib/lobby/google-cast";
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

export type CastMethod = "chromecast" | "airplay" | "wireless" | "fullscreen" | null;

type CastStatus = "idle" | "casting" | "error";

export function useLobbyTvCast(initialTvLayout = false) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tvLayoutActive, setTvLayoutActive] = useState(initialTvLayout);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [castStatus, setCastStatus] = useState<CastStatus>("idle");
  const [castError, setCastError] = useState<string | null>(null);
  const [castMethod, setCastMethod] = useState<CastMethod>(null);
  const [presentationConnected, setPresentationConnected] = useState(false);
  const presentationConnectionRef = useRef<PresentationConnectionLike | null>(null);
  const { requestWakeLock, releaseWakeLock } = useScreenWakeLock();

  const tvCastUrl = typeof window !== "undefined" ? buildLobbyTvCastUrl() : "/lobby/checkouts?display=tv";
  const isTvLayout = initialTvLayout || tvLayoutActive;
  const isCasting =
    castStatus === "casting" ||
    presentationConnected ||
    isAirPlayCastActive() ||
    isGoogleCastSessionActive();
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
    setMenuOpen(false);

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

    stopAirPlayCast();
    await stopGoogleCastSession();
    await exitDocumentFullscreen();
    await releaseWakeLock();
    setTvLayoutActive(false);
    setCastMethod(null);
    setCastStatus("idle");
    syncFullscreenState();
  }, [releaseWakeLock, syncFullscreenState]);

  const startPresentationCast = useCallback(async () => {
    if (!isPresentationCastSupported()) {
      throw new Error("Wireless display is not supported in this browser. Use Chrome on desktop.");
    }

    const PresentationRequestCtor = getPresentationRequestConstructor();
    if (!PresentationRequestCtor) {
      throw new Error("Wireless display is not supported in this browser.");
    }

    const request = new PresentationRequestCtor([buildLobbyTvCastUrl()]);
    const connection = await request.start();
    presentationConnectionRef.current = connection;
    setPresentationConnected(true);
    setCastMethod("wireless");
    setCastStatus("casting");
    setMenuOpen(false);
    void requestWakeLock();

    connection.addEventListener("close", () => {
      if (presentationConnectionRef.current === connection) {
        presentationConnectionRef.current = null;
        setPresentationConnected(false);
        setCastMethod(null);
        setCastStatus("idle");
      }
    });

    connection.addEventListener("terminate", () => {
      void stopTvCast();
    });
  }, [requestWakeLock, stopTvCast]);

  const startChromecast = useCallback(async () => {
    setCastError(null);

    if (isGoogleCastConfigured()) {
      await startGoogleCastSession();
      setCastMethod("chromecast");
      setCastStatus("casting");
      setMenuOpen(false);
      void requestWakeLock();
      return;
    }

    if (isPresentationCastSupported()) {
      await startPresentationCast();
      setCastMethod("chromecast");
      return;
    }

    throw new Error("Use Chrome on desktop to cast to Chromecast, or configure NEXT_PUBLIC_GOOGLE_CAST_APP_ID.");
  }, [requestWakeLock, startPresentationCast]);

  const startAirPlay = useCallback(async () => {
    setCastError(null);
    await startAirPlayCast();
    setCastMethod("airplay");
    setCastStatus("casting");
    setMenuOpen(false);
    void requestWakeLock();
  }, [requestWakeLock]);

  const startFullscreenKiosk = useCallback(async () => {
    setCastError(null);
    setTvLayoutActive(true);
    const enteredFullscreen = await requestDocumentFullscreen();
    if (!enteredFullscreen) {
      throw new Error("Fullscreen was blocked by the browser.");
    }
    setCastMethod("fullscreen");
    setCastStatus("casting");
    setMenuOpen(false);
    await requestWakeLock();
  }, [requestWakeLock]);

  const copyTvLink = useCallback(async () => {
    setCastError(null);
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard is not available in this browser.");
    }
    await navigator.clipboard.writeText(tvCastUrl);
    setMenuOpen(false);
  }, [tvCastUrl]);

  const openTvLink = useCallback(() => {
    setCastError(null);
    const popup = window.open(tvCastUrl, "fitdog-lobby-tv", "noopener,noreferrer");
    if (!popup) {
      throw new Error("Pop-up blocked. Allow pop-ups or open the TV link manually.");
    }
    setMenuOpen(false);
  }, [tvCastUrl]);

  const openCastMenu = useCallback(() => {
    setCastError(null);
    setMenuOpen(true);
  }, []);

  const closeCastMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleTvCast = useCallback(async () => {
    if (isCasting || isFullscreen) {
      await stopTvCast();
      return;
    }
    openCastMenu();
  }, [isCasting, isFullscreen, openCastMenu, stopTvCast]);

  return {
    menuOpen,
    tvCastUrl,
    isTvLayout,
    isCasting,
    isFullscreen,
    showCastActive,
    castStatus,
    castError,
    castMethod,
    canChromecast: isGoogleCastConfigured() || isPresentationCastSupported(),
    chromecastAppId: getGoogleCastAppId(),
    canAirPlay: isAirPlayPickerSupported() || (isAppleDevice() && isDisplayMediaSupported()),
    canFullscreen: isFullscreenSupported(),
    openCastMenu,
    closeCastMenu,
    startChromecast,
    startAirPlay,
    startFullscreenKiosk,
    copyTvLink,
    openTvLink,
    stopTvCast,
    toggleTvCast,
    setCastError
  };
}
