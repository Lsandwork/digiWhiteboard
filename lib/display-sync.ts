export const DISPLAY_SYNC_POLL_MS = 5000;
export const DISPLAY_SYNC_STORAGE_KEY = "fitdog-display-sync";

export type DisplaySyncState = {
  display_content_revision: number;
  cast_hard_reload_nonce: number;
  build_id: string;
  lobby_published_version: string;
  staff_published_version: string;
};

export function readStoredDisplaySync(): DisplaySyncState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DISPLAY_SYNC_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DisplaySyncState;
  } catch {
    return null;
  }
}

export function writeStoredDisplaySync(state: DisplaySyncState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DISPLAY_SYNC_STORAGE_KEY, JSON.stringify(state));
}

export function hardReloadDisplay(castReloadNonce: number) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("_cast_reload", String(castReloadNonce));
  window.location.replace(url.toString());
}

export function softReloadDisplay() {
  if (typeof window === "undefined") return;
  window.location.reload();
}
