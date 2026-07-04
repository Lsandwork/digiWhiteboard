"use client";

import { useEffect, useRef } from "react";
import {
  DISPLAY_SYNC_POLL_MS,
  hardReloadDisplay,
  readStoredDisplaySync,
  softReloadDisplay,
  writeStoredDisplaySync,
  type DisplaySyncState
} from "@/lib/display-sync";

type UseDisplaySyncOptions = {
  enabled?: boolean;
  onContentUpdate?: () => void;
};

async function fetchDisplaySync(): Promise<DisplaySyncState | null> {
  try {
    const response = await fetch("/api/display/sync", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as DisplaySyncState;
  } catch {
    return null;
  }
}

function applySyncUpdate(
  next: DisplaySyncState,
  previous: DisplaySyncState,
  onContentUpdate?: () => void
) {
  if (next.cast_hard_reload_nonce !== previous.cast_hard_reload_nonce) {
    writeStoredDisplaySync({ ...next });
    hardReloadDisplay(next.cast_hard_reload_nonce);
    return;
  }

  if (next.build_id !== previous.build_id) {
    writeStoredDisplaySync({ ...next });
    softReloadDisplay();
    return;
  }

  if (next.display_content_revision !== previous.display_content_revision) {
    writeStoredDisplaySync({ ...next });
    onContentUpdate?.();
    return;
  }

  if (
    next.lobby_published_version !== previous.lobby_published_version ||
    next.staff_published_version !== previous.staff_published_version
  ) {
    writeStoredDisplaySync({ ...next });
    onContentUpdate?.();
  }
}

export function useDisplaySync({ enabled = true, onContentUpdate }: UseDisplaySyncOptions = {}) {
  const onContentUpdateRef = useRef(onContentUpdate);
  const syncRef = useRef<DisplaySyncState | null>(null);

  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
  }, [onContentUpdate]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const poll = async () => {
      const next = await fetchDisplaySync();
      if (!next || cancelled) return;

      const stored = readStoredDisplaySync();
      if (!syncRef.current) {
        syncRef.current = stored ?? next;
        writeStoredDisplaySync(stored ?? next);
        return;
      }

      const previous = syncRef.current;
      applySyncUpdate(next, previous, () => onContentUpdateRef.current?.());
      syncRef.current = readStoredDisplaySync() ?? next;
    };

    void poll();
    const timer = window.setInterval(() => void poll(), DISPLAY_SYNC_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
}
