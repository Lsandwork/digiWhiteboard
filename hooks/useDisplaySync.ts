"use client";

import { useEffect, useRef } from "react";
import { applyDisplaySyncUpdate, fetchDisplaySyncState } from "@/lib/display-keeper-client";
import { DISPLAY_SYNC_POLL_MS, readStoredDisplaySync, writeStoredDisplaySync } from "@/lib/display-sync";

type UseDisplaySyncOptions = {
  enabled?: boolean;
  onContentUpdate?: () => void;
  pollIntervalMs?: number;
};

function sameDisplaySync(a: { build_id: string; cast_hard_reload_nonce: number; display_content_revision: number }, b: typeof a) {
  return (
    a.build_id === b.build_id &&
    a.cast_hard_reload_nonce === b.cast_hard_reload_nonce &&
    a.display_content_revision === b.display_content_revision
  );
}

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

      const stored = readStoredDisplaySync();
      if (!syncRef.current) {
        const previous = stored ?? next;
        syncRef.current = previous;
        if (!stored || sameDisplaySync(stored, next)) {
          writeStoredDisplaySync(next);
          syncRef.current = next;
          return;
        }
        applyDisplaySyncUpdate(next, previous, () => onContentUpdateRef.current?.());
        syncRef.current = readStoredDisplaySync() ?? next;
        return;
      }

      const previous = syncRef.current;
      applyDisplaySyncUpdate(next, previous, () => onContentUpdateRef.current?.());
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
