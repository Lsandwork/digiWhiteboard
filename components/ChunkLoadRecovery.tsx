"use client";

import { useEffect } from "react";

const RELOAD_KEY = "fitdog-chunk-reload";

function isChunkLoadFailure(message: string, source?: string) {
  const haystack = `${message} ${source ?? ""}`.toLowerCase();
  return (
    haystack.includes("loading chunk") ||
    haystack.includes("chunkloaderror") ||
    haystack.includes("failed to fetch dynamically imported module") ||
    haystack.includes("importing a module script failed")
  );
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const reloadOnce = () => {
      if (typeof window === "undefined") return;
      if (window.sessionStorage.getItem(RELOAD_KEY) === "1") return;
      window.sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.message, event.filename)) {
        reloadOnce();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
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
