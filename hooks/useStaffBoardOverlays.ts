"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";

/** Poll frequently enough that a push lands on TVs within a few seconds after cache invalidation. */
const BOARD_OVERLAY_POLL_MS = 4_000;
const BOARD_OVERLAY_TIMEOUT_MS = 5_000;

export type StaffBoardOverlaysClient = {
  activePushNotice: StaffPushNotice | null;
  grooming: { activeNotice: GroomingPushNotice | null; queue: GroomingPushNotice[] };
  trainer: { activeNotice: TrainerPushNotice | null; queue: TrainerPushNotice[] };
  castVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
  emergencyCastVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
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
  emergencyCastVideo: { activeNotice: null, queue: [] }
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

  const load = useCallback(async () => {
    if (!enabled) return;
    const url = `/api/staff/board-overlays?department=${encodeURIComponent(department)}${debug ? "&debugBoard=1" : ""}`;
    const result = await fetchBoardJson<StaffBoardOverlaysClient>({
      url,
      timeoutMs: BOARD_OVERLAY_TIMEOUT_MS,
      debug,
      cacheKey: `staff-overlays:${department}`,
      keepLastGood: true
    });
    if (result.data) {
      setOverlays(result.data);
    }
  }, [department, debug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), pollMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, load, pollMs]);

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
    reload: load,
    viewerKey: getViewerKey()
  };
}
