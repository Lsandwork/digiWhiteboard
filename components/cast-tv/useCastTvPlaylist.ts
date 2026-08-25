"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isCastTvPlaylistCacheFresh,
  readCastTvPlaylistCache,
  writeCastTvPlaylistCache
} from "@/lib/cast-tv/client-cache";
import {
  CAST_TV_HEARTBEAT_MS,
  CAST_TV_POLL_MS,
  type CastTvPlaylistItem,
  type CastTvSettings
} from "@/lib/cast-tv/types";
import { TV_HARD_REFRESH_ENDPOINT, visitPageAsNewNavigation } from "@/lib/tv-hard-refresh";

const DEFAULT_SETTINGS: CastTvSettings = {
  id: "00000000-0000-4000-8000-00000000c0a7",
  default_image_seconds: 10,
  transition_ms: 700,
  transition_style: "fade",
  object_fit: "contain",
  show_standby_logo: true,
  is_paused: false,
  updated_at: new Date(0).toISOString(),
  updated_by: null
};

function mergePlaylistPreservingCurrent(
  previous: CastTvPlaylistItem[],
  next: CastTvPlaylistItem[],
  currentId: string | null
): { playlist: CastTvPlaylistItem[]; currentId: string | null } {
  if (!next.length) return { playlist: [], currentId: null };
  if (!currentId) return { playlist: next, currentId: next[0]?.id ?? null };

  const stillExists = next.some((item) => item.id === currentId);
  if (stillExists) return { playlist: next, currentId };
  return { playlist: next, currentId: next[0]?.id ?? null };
}

export function useCastTvPlaylist(screenId = "default") {
  const [playlist, setPlaylist] = useState<CastTvPlaylistItem[]>([]);
  const [settings, setSettings] = useState<CastTvSettings>(DEFAULT_SETTINGS);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const currentIdRef = useRef<string | null>(null);
  const seenNonceRef = useRef<number | null>(null);
  const revisionRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const applyRefreshNonce = useCallback((rawNonce: unknown) => {
    const nonce = Number(rawNonce);
    if (!Number.isFinite(nonce)) return;
    if (seenNonceRef.current === null) {
      seenNonceRef.current = nonce;
      return;
    }
    if (nonce !== seenNonceRef.current) {
      visitPageAsNewNavigation();
    }
  }, []);

  const applyPlaylist = useCallback((next: CastTvPlaylistItem[]) => {
    setPlaylist((previous) => {
      const merged = mergePlaylistPreservingCurrent(previous, next, currentIdRef.current);
      setCurrentId(merged.currentId);
      return merged.playlist;
    });
  }, []);

  const refresh = useCallback(async (trigger: "initial-load" | "refresh" = "refresh") => {
    if (typeof document !== "undefined" && document.hidden && trigger === "refresh") return;
    if (refreshInFlightRef.current) return;
    const existing = readCastTvPlaylistCache();
    if (
      trigger === "refresh" &&
      isCastTvPlaylistCacheFresh(existing) &&
      existing?.revision &&
      existing.revision === revisionRef.current
    ) {
      return;
    }

    refreshInFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let latestSettings = existing?.settings ?? null;
      let latestRevision = revisionRef.current;

      if (trigger === "refresh") {
        const settingsResponse = await fetch("/api/cast-tv/settings", {
          cache: "no-store",
          signal: controller.signal
        });
        const settingsBody = await settingsResponse.json();
        if (settingsResponse.ok && settingsBody.settings) {
          latestSettings = settingsBody.settings as CastTvSettings;
          setSettings(latestSettings);
          applyRefreshNonce(settingsBody.castHardReloadNonce);
        }
        if (typeof settingsBody.mediaRevision === "string") {
          latestRevision = settingsBody.mediaRevision;
        }
        if (latestRevision && latestRevision === revisionRef.current && (existing?.playlist.length || currentIdRef.current)) {
          revisionRef.current = latestRevision;
          return;
        }
      }

      const [mediaResponse, settingsResponse] = await Promise.all([
        fetch("/api/cast-tv/media?playlist=1", { cache: "no-store", signal: controller.signal }),
        trigger === "initial-load"
          ? fetch("/api/cast-tv/settings", { cache: "no-store", signal: controller.signal })
          : Promise.resolve(null)
      ]);

      const mediaBody = await mediaResponse.json();
      const settingsBody = settingsResponse ? await settingsResponse.json() : null;
      if (settingsBody?.settings) {
        latestSettings = settingsBody.settings as CastTvSettings;
        setSettings(latestSettings);
        applyRefreshNonce(settingsBody.castHardReloadNonce);
      }
      if (typeof settingsBody?.mediaRevision === "string") {
        latestRevision = settingsBody.mediaRevision;
      }

      if (mediaResponse.ok && Array.isArray(mediaBody.playlist)) {
        const next = mediaBody.playlist as CastTvPlaylistItem[];
        if (next.length > 0 || !currentIdRef.current) {
          applyPlaylist(next);
        }
        revisionRef.current = latestRevision;
        writeCastTvPlaylistCache({
          playlist: next.length > 0 || !currentIdRef.current ? next : existing?.playlist ?? next,
          settings: latestSettings,
          revision: latestRevision ?? undefined
        });
      }
    } catch {
      // TV display stays quiet on network errors.
    } finally {
      refreshInFlightRef.current = false;
      setReady(true);
    }
  }, [applyPlaylist, applyRefreshNonce]);

  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch("/api/cast-tv/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screenId })
      });
    } catch {
      // Ignore heartbeat failures.
    }
  }, [screenId]);

  useEffect(() => {
    const cachedPlaylist = readCastTvPlaylistCache();
    if (cachedPlaylist?.playlist.length) {
      applyPlaylist(cachedPlaylist.playlist);
      if (cachedPlaylist.settings) setSettings(cachedPlaylist.settings);
      if (cachedPlaylist.revision) revisionRef.current = cachedPlaylist.revision;
      setReady(true);
    }

    const skipInitialNetwork = isCastTvPlaylistCacheFresh(cachedPlaylist);
    if (!skipInitialNetwork) {
      void refresh("initial-load");
    }
    void sendHeartbeat();

    const pollTimer = window.setInterval(() => {
      void refresh("refresh");
    }, CAST_TV_POLL_MS);

    const heartbeatTimer = window.setInterval(() => {
      if (document.hidden) return;
      void sendHeartbeat();
    }, CAST_TV_HEARTBEAT_MS);

    return () => {
      abortRef.current?.abort();
      window.clearInterval(pollTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [applyPlaylist, refresh, sendHeartbeat]);

  useEffect(() => {
    let cancelled = false;
    const checkNonce = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(TV_HARD_REFRESH_ENDPOINT, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { nonce?: unknown };
        applyRefreshNonce(body.nonce);
      } catch {
        // TV display stays quiet on network errors.
      }
    };

    void checkNonce();
    const timer = window.setInterval(() => {
      void checkNonce();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyRefreshNonce]);

  const advance = useCallback(() => {
    setPlaylist((items) => {
      if (!items.length) {
        setCurrentId(null);
        return items;
      }
      const currentIndex = items.findIndex((item) => item.id === currentIdRef.current);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      setCurrentId(items[nextIndex]?.id ?? null);
      return items;
    });
  }, []);

  const skipFailed = useCallback(() => {
    advance();
  }, [advance]);

  const currentIndex = playlist.findIndex((item) => item.id === currentId);
  const currentItem = currentIndex >= 0 ? playlist[currentIndex] : playlist[0] ?? null;
  const nextItem =
    playlist.length > 1
      ? playlist[(Math.max(currentIndex, 0) + 1) % playlist.length]
      : null;

  return {
    playlist,
    settings,
    currentItem,
    nextItem,
    currentId,
    ready,
    advance,
    skipFailed,
    isPaused: settings.is_paused,
    isEmpty: playlist.length === 0
  };
}
