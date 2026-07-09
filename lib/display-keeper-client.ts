import type { DisplaySyncState } from "@/lib/display-sync";
import {
  DISPLAY_BUILD_RELOAD_KEY,
  hardReloadDisplay,
  readStoredDisplaySync,
  softReloadDisplay,
  writeStoredDisplaySync
} from "@/lib/display-sync";

function shouldReloadForBuild(buildId: string) {
  if (typeof window === "undefined") return true;
  try {
    const last = window.sessionStorage.getItem(DISPLAY_BUILD_RELOAD_KEY);
    if (last === buildId) return false;
    window.sessionStorage.setItem(DISPLAY_BUILD_RELOAD_KEY, buildId);
    return true;
  } catch {
    return true;
  }
}

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
) {
  if (next.cast_hard_reload_nonce !== previous.cast_hard_reload_nonce) {
    writeStoredDisplaySync({ ...next });
    hardReloadDisplay(next.cast_hard_reload_nonce);
    return;
  }

  if (next.build_id !== previous.build_id) {
    writeStoredDisplaySync({ ...next });
    if (shouldReloadForBuild(next.build_id)) {
      softReloadDisplay();
    } else {
      onContentUpdate?.();
    }
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

export function readInitialDisplaySync() {
  return readStoredDisplaySync();
}
