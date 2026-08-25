import type { CastTvPlaylistItem, CastTvSettings } from "@/lib/cast-tv/types";

const PLAYLIST_CACHE_KEY = "cast-tv:playlist-cache:v1";
export const CAST_TV_PLAYLIST_CACHE_MS = 20_000;

export type CastTvPlaylistCache = {
  savedAt: number;
  playlist: CastTvPlaylistItem[];
  settings?: CastTvSettings | null;
  revision?: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readCastTvPlaylistCache(): CastTvPlaylistCache | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(PLAYLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CastTvPlaylistCache;
    if (!parsed || !Array.isArray(parsed.playlist) || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCastTvPlaylistCache(cache: Omit<CastTvPlaylistCache, "savedAt">) {
  if (!canUseStorage()) return;
  try {
    const payload: CastTvPlaylistCache = { ...cache, savedAt: Date.now() };
    window.sessionStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function isCastTvPlaylistCacheFresh(cache: CastTvPlaylistCache | null, maxAgeMs = CAST_TV_PLAYLIST_CACHE_MS) {
  if (!cache) return false;
  return Date.now() - cache.savedAt < maxAgeMs;
}
