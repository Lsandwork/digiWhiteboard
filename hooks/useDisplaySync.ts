"use client";

import { useEffect, useRef } from "react";
import { applyDisplaySyncUpdate, fetchDisplaySyncState } from "@/lib/display-keeper-client";
import { DISPLAY_SYNC_POLL_MS, readStoredDisplaySync, writeStoredDisplaySync } from "@/lib/display-sync";

type UseDisplaySyncOptions = {
  enabled?: boolean;
  onContentUpdate?: () => void;
  pollIntervalMs?: number;
};

export function useDisplaySync({
  enabled = true,
  onContentUpdate,
  pollIntervalMs = DISPLAY_SYNC_POLL_MS
}: UseDisplaySyncOptions = {}) {
  const onContentUpdateRef = useRef(onContentUpdate);
  const syncRef = useRef<ReturnType<typeof readStoredDisplaySync>>(null);

  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
  }, [onContentUpdate]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const interval = Math.max(1_000, pollIntervalMs);

    const poll = async () => {
      const next = await fetchDisplaySyncState();
      if (!next || cancelled) return;

      if (!syncRef.current) {
        writeStoredDisplaySync(next);
        syncRef.current = next;
        return;
      }

      const previous = syncRef.current;
      const result = applyDisplaySyncUpdate(next, previous, () => onContentUpdateRef.current?.());
      if (result === "reloading") return;
      syncRef.current = readStoredDisplaySync() ?? next;
    };

    void poll();
    const timer = window.setInterval(() => void poll(), interval);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, pollIntervalMs]);
}
