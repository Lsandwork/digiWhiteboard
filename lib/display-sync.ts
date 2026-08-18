export const DISPLAY_SYNC_POLL_MS = 15_000;
export const DISPLAY_SYNC_STORAGE_KEY = "fitdog-display-sync";
export const DISPLAY_BUILD_RELOAD_KEY = "fitdog-display-build-reload";

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
  try {
    window.sessionStorage.setItem(DISPLAY_SYNC_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures on locked-down TV browsers.
  }
}

export function hardReloadDisplay(castReloadNonce: number) {
  if (typeof window === "undefined") return;
  const nonce = Number(castReloadNonce);
  if (!Number.isFinite(nonce)) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_cast_reload", String(nonce));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

export function softReloadDisplay() {
  if (typeof window === "undefined") return;
  window.location.reload();
}

/** Reload at most once per deployed build — prevents TV refresh loops after deploys. */
export function shouldReloadForBuild(buildId: string) {
  const next = String(buildId || "").trim();
  if (!next) return false;
  if (typeof window === "undefined") return true;
  try {
    const last = window.sessionStorage.getItem(DISPLAY_BUILD_RELOAD_KEY);
    if (last === next) return false;
    window.sessionStorage.setItem(DISPLAY_BUILD_RELOAD_KEY, next);
    return true;
  } catch {
    return false;
  }
}

/** Skip hard-reload if this nonce is already on the URL (replace would loop). */
export function shouldReloadForCastNonce(castReloadNonce: number) {
  const nonce = Number(castReloadNonce);
  if (!Number.isFinite(nonce)) return false;
  if (typeof window === "undefined") return true;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("_cast_reload") === String(nonce)) return false;
  } catch {
    return false;
  }
  return true;
}
