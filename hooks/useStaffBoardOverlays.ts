"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  BOARD_OVERLAY_BROADCAST_EVENT,
  getBoardOverlayChannelName
} from "@/lib/staff/board-overlay-broadcast-shared";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";
import {
  DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  normalizeStaffWhiteboardThemeId,
  type StaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-themes";

/** Shared cached API — keep ≥30s so UI refresh does not drive Supabase QPS. */
const BOARD_OVERLAY_POLL_MS = 30_000;
const BOARD_OVERLAY_TIMEOUT_MS = 5_000;

export type StaffBoardOverlaysClient = {
  activePushNotice: StaffPushNotice | null;
  grooming: { activeNotice: GroomingPushNotice | null; queue: GroomingPushNotice[] };
  trainer: { activeNotice: TrainerPushNotice | null; queue: TrainerPushNotice[] };
  castVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
  emergencyCastVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
  whiteboardTheme?: StaffWhiteboardThemeId;
  healthy?: {
    push: boolean;
    grooming: boolean;
    trainer: boolean;
    castVideo: boolean;
    emergencyCastVideo: boolean;
  };
  loadedAt?: string;
};

const emptyOverlays: StaffBoardOverlaysClient = {
  activePushNotice: null,
  grooming: { activeNotice: null, queue: [] },
  trainer: { activeNotice: null, queue: [] },
  castVideo: { activeNotice: null, queue: [] },
  emergencyCastVideo: { activeNotice: null, queue: [] },
  whiteboardTheme: DEFAULT_STAFF_WHITEBOARD_THEME_ID
};

function getViewerKey() {
  if (typeof window === "undefined") return "server";
  const key = "fitdog_cast_viewer_key";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `viewer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export function useStaffBoardOverlays(options?: {
  department?: string;
  enabled?: boolean;
  debug?: boolean;
  pollMs?: number;
}) {
  const department = options?.department ?? "staff_whiteboard";
  const enabled = options?.enabled !== false;
  const debug = Boolean(options?.debug);
  const pollMs = options?.pollMs ?? BOARD_OVERLAY_POLL_MS;
  const [overlays, setOverlays] = useState<StaffBoardOverlaysClient>(emptyOverlays);

  const load = useCallback(
    async (options?: { fresh?: boolean }) => {
      if (!enabled) return;
      const url = `/api/staff/board-overlays?department=${encodeURIComponent(department)}${debug ? "&debugBoard=1" : ""}${options?.fresh ? "&fresh=1" : ""}`;
      const result = await fetchBoardJson<StaffBoardOverlaysClient>({
        url,
        timeoutMs: BOARD_OVERLAY_TIMEOUT_MS,
        debug,
        // Fresh (event-driven) loads must not be answered by the board
        // fetch cache either — they exist to observe a just-saved change.
        cacheKey: options?.fresh ? undefined : `staff-overlays:${department}`,
        keepLastGood: true
      });
      if (result.data) {
        setOverlays(result.data);
      }
    },
    [department, debug, enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void load(), 0);
    // Low-frequency recovery fallback only. A per-mount jitter keeps many
    // displays from polling in lockstep after a shared reconnect.
    const jitterMs = Math.floor(Math.random() * 5_000);
    const timer = window.setInterval(() => void load(), pollMs + jitterMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, load, pollMs]);

  // Event-first path: one server broadcast per saved change fans out to
  // every connected board, which then performs a single fresh fetch.
  // Subscription failure is non-fatal — the poll above remains the
  // recovery mechanism. The channel is removed on unmount/remount so
  // subscriptions never accumulate.
  const lastFreshLoadAtRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let channel: ReturnType<NonNullable<ReturnType<typeof getBrowserSupabase>>["channel"]> | null = null;
    let supabase: ReturnType<typeof getBrowserSupabase> = null;
    try {
      supabase = getBrowserSupabase();
      if (!supabase) return;
      // Broadcast delivery is by exact topic — this name must equal the
      // server's publish topic (see board-overlay-broadcast-shared).
      channel = supabase.channel(getBoardOverlayChannelName());
      channel
        .on("broadcast", { event: BOARD_OVERLAY_BROADCAST_EVENT }, () => {
          // Coalesce duplicates/bursts: a broadcast is only a hint to
          // refetch, so at most one fresh fetch per 2s per board — the
          // fallback poll covers anything coalesced away.
          const now = Date.now();
          if (now - lastFreshLoadAtRef.current < 2_000) return;
          lastFreshLoadAtRef.current = now;
          void load({ fresh: true });
        })
        .subscribe();
    } catch {
      return;
    }
    return () => {
      try {
        if (supabase && channel) void supabase.removeChannel(channel);
      } catch {
        // Cleanup failure must never break the board.
      }
    };
  }, [department, enabled, load]);

  return {
    activePushNotice: overlays.activePushNotice,
    emergencyCastVideo: overlays.emergencyCastVideo.activeNotice,
    emergencyCastQueue: overlays.emergencyCastVideo.queue,
    activeCastVideo: overlays.castVideo.activeNotice,
    castVideoQueue: overlays.castVideo.queue,
    activeGroomingNotice: overlays.grooming.activeNotice,
    groomingQueue: overlays.grooming.queue,
    activeTrainerNotice: overlays.trainer.activeNotice,
    trainerQueue: overlays.trainer.queue,
    whiteboardTheme: normalizeStaffWhiteboardThemeId(overlays.whiteboardTheme),
    reload: load,
    viewerKey: getViewerKey()
  };
}
