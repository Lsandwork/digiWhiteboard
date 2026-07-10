"use client";

export function isDebugBoardEnabled(searchParams?: URLSearchParams | null) {
  if (typeof window === "undefined") {
    return searchParams?.get("debugBoard") === "1";
  }
  return new URLSearchParams(window.location.search).get("debugBoard") === "1";
}

export function debugBoardClient(
  enabled: boolean,
  scope: string,
  message: string,
  details?: Record<string, unknown>
) {
  if (!enabled || typeof console === "undefined") return;
  if (details) {
    console.info(`[FitdogBoardDebug:${scope}] ${message}`, details);
    return;
  }
  console.info(`[FitdogBoardDebug:${scope}] ${message}`);
}
