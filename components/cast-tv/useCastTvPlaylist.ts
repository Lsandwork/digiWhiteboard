"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const refresh = useCallback(async () => {
    try {
      const [mediaResponse, settingsResponse] = await Promise.all([
        fetch("/api/cast-tv/media", { cache: "no-store" }),
        fetch("/api/cast-tv/settings", { cache: "no-store" })
      ]);

      const mediaBody = await mediaResponse.json();
      const settingsBody = await settingsResponse.json();

      if (mediaResponse.ok && Array.isArray(mediaBody.playlist)) {
        const next = mediaBody.playlist as CastTvPlaylistItem[];
        if (next.length > 0 || !currentIdRef.current) {
          applyPlaylist(next);
        }
      }

      if (settingsResponse.ok && settingsBody.settings) {
        setSettings(settingsBody.settings as CastTvSettings);
        applyRefreshNonce(settingsBody.castHardReloadNonce);
      }
    } catch {
      // TV display stays quiet on network errors.
    } finally {
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
    void refresh();
    void sendHeartbeat();

    const pollTimer = window.setInterval(() => {
      void refresh();
    }, CAST_TV_POLL_MS);

    const heartbeatTimer = window.setInterval(() => {
      void sendHeartbeat();
    }, CAST_TV_HEARTBEAT_MS);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [refresh, sendHeartbeat]);

  useEffect(() => {
    let cancelled = false;
    const checkNonce = async () => {
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
