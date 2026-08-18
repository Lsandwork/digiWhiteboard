import type { DisplaySyncState } from "@/lib/display-sync";
import {
  hardReloadDisplay,
  readStoredDisplaySync,
  shouldReloadForBuild,
  shouldReloadForCastNonce,
  softReloadDisplay,
  writeStoredDisplaySync
} from "@/lib/display-sync";

export type DisplaySyncApplyResult = "noop" | "updated" | "reloading";

export async function fetchDisplaySyncState() {
  try {
    const response = await fetch("/api/display/sync", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as DisplaySyncState;
  } catch {
    return null;
  }
}

export function applyDisplaySyncUpdate(
  next: DisplaySyncState,
  previous: DisplaySyncState,
  onContentUpdate?: () => void
): DisplaySyncApplyResult {
  if (next.cast_hard_reload_nonce !== previous.cast_hard_reload_nonce) {
    if (shouldReloadForCastNonce(next.cast_hard_reload_nonce)) {
      hardReloadDisplay(next.cast_hard_reload_nonce);
      return "reloading";
    }
    writeStoredDisplaySync({ ...next });
    onContentUpdate?.();
    return "updated";
  }

  if (next.build_id !== previous.build_id) {
    writeStoredDisplaySync({ ...next });
    if (shouldReloadForBuild(next.build_id)) {
      softReloadDisplay();
      return "reloading";
    }
    onContentUpdate?.();
    return "updated";
  }

  if (next.display_content_revision !== previous.display_content_revision) {
    writeStoredDisplaySync({ ...next });
    onContentUpdate?.();
    return "updated";
  }

  if (
    next.lobby_published_version !== previous.lobby_published_version ||
    next.staff_published_version !== previous.staff_published_version
  ) {
    writeStoredDisplaySync({ ...next });
    onContentUpdate?.();
    return "updated";
  }

  return "noop";
}

export function readInitialDisplaySync() {
  return readStoredDisplaySync();
}
