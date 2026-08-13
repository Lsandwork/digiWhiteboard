"use client";

import { useEffect } from "react";

const RELOAD_KEY = "fitdog-chunk-reload";
const SOCIAL_MOMENTS_SW = "sw-social-moments.js";

function isChunkLoadFailure(message: string, source?: string) {
  const haystack = `${message} ${source ?? ""}`.toLowerCase();
  return (
    haystack.includes("loading chunk") ||
    haystack.includes("chunkloaderror") ||
    haystack.includes("failed to fetch dynamically imported module") ||
    haystack.includes("importing a module script failed")
  );
}

function isSafariPatternError(message: string) {
  return /did not match the expected pattern/i.test(message);
}

async function unregisterStaleServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const onAdmin = window.location.pathname.startsWith("/admin");
    await Promise.all(
      registrations.map(async (registration) => {
        const script =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          "";
        const isSocialMoments = script.includes(SOCIAL_MOMENTS_SW);
        if (onAdmin || !isSocialMoments) {
          await registration.unregister();
        }
      })
    );
  } catch {
    // Ignore SW cleanup failures — never block the app.
  }
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    void unregisterStaleServiceWorkers();

    const reloadOnce = () => {
      if (typeof window === "undefined") return;
      if (window.sessionStorage.getItem(RELOAD_KEY) === "1") return;
      window.sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      if (isSafariPatternError(event.message)) {
        event.preventDefault();
        return;
      }
      if (isChunkLoadFailure(event.message, event.filename)) {
        reloadOnce();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (isSafariPatternError(message)) {
        event.preventDefault();
        return;
      }
      if (isChunkLoadFailure(message)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
