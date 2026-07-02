"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAirPlayCastActive,
  isAirPlayCastAvailable,
  stopAirPlayCast
} from "@/lib/lobby/airplay-cast";
import {
  openAirPlayPicker,
  openChromecastPicker,
  openDefaultCastDevicePicker,
  type CastPickerResult
} from "@/lib/lobby/cast-picker";
import {
  getGoogleCastAppId,
  isGoogleCastBrowser,
  isGoogleCastConfigured,
  isGoogleCastSessionActive,
  preloadGoogleCast,
  stopGoogleCastSession
} from "@/lib/lobby/google-cast";
import {
  buildLobbyTvCastUrl,
  exitDocumentFullscreen,
  isDocumentFullscreen,
  isFullscreenSupported,
  isPresentationCastSupported,
  requestDocumentFullscreen,
  type PresentationConnectionLike
} from "@/lib/lobby/tv-cast";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

export type CastMethod = "chromecast" | "wireless" | "airplay" | "fullscreen" | null;

type CastStatus = "idle" | "casting" | "error";

function applyCastResult(
  method: CastMethod,
  setCastMethod: (method: CastMethod) => void,
  setCastStatus: (status: CastStatus) => void,
  setMenuOpen: (open: boolean) => void,
  requestWakeLock: () => void | Promise<void>
) {
  setCastMethod(method);
  setCastStatus("casting");
  setMenuOpen(false);
  void requestWakeLock();
}

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

  useEffect(() => {
    if (!isGoogleCastBrowser()) return;
    void preloadGoogleCast();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const href = buildLobbyTvCastUrl();
    let link = document.querySelector<HTMLLinkElement>('link[rel="presentation"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "presentation";
      document.head.appendChild(link);
    }
    link.href = href;

    return () => {
      link?.remove();
    };
  }, []);

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

  const attachPresentationConnection = useCallback(
    (connection: PresentationConnectionLike) => {
      presentationConnectionRef.current = connection;
      setPresentationConnected(true);
      applyCastResult("wireless", setCastMethod, setCastStatus, setMenuOpen, requestWakeLock);

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
    },
    [requestWakeLock, stopTvCast]
  );

  const handleCastPickerResult = useCallback(
    async (picker: () => Promise<CastPickerResult>) => {
      setCastError(null);
      const result = await picker();

      if (result.method === "wireless") {
        attachPresentationConnection(result.connection);
        return;
      }

      applyCastResult(result.method, setCastMethod, setCastStatus, setMenuOpen, requestWakeLock);
    },
    [attachPresentationConnection, requestWakeLock]
  );

  const openCastDevicePickerFlow = useCallback(async () => {
    await handleCastPickerResult(openDefaultCastDevicePicker);
  }, [handleCastPickerResult]);

  const startChromecast = useCallback(async () => {
    await handleCastPickerResult(openChromecastPicker);
  }, [handleCastPickerResult]);

  const startAirPlay = useCallback(async () => {
    await handleCastPickerResult(openAirPlayPicker);
  }, [handleCastPickerResult]);

  const startFullscreenKiosk = useCallback(async () => {
    setCastError(null);
    setTvLayoutActive(true);
    const enteredFullscreen = await requestDocumentFullscreen();
    if (!enteredFullscreen) {
      throw new Error("Fullscreen was blocked by the browser.");
    }
    applyCastResult("fullscreen", setCastMethod, setCastStatus, setMenuOpen, requestWakeLock);
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

    await openCastDevicePickerFlow();
  }, [isCasting, isFullscreen, openCastDevicePickerFlow, stopTvCast]);

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
    canCastDevices: isGoogleCastConfigured() || isPresentationCastSupported() || isGoogleCastBrowser() || isAirPlayCastAvailable(),
    canChromecast: isGoogleCastConfigured() || isPresentationCastSupported() || isGoogleCastBrowser(),
    chromecastAppId: getGoogleCastAppId(),
    canAirPlay: isAirPlayCastAvailable(),
    canFullscreen: isFullscreenSupported(),
    openCastMenu,
    closeCastMenu,
    openCastDevicePicker: openCastDevicePickerFlow,
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
