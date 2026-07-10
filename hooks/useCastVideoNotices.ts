"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";

const CAST_VIDEO_POLL_MS = 12_000;
const CAST_VIDEO_TIMEOUT_MS = 4000;

type CastVideoResponse = {
  activeNotice: CastVideoNotice | null;
  queue: CastVideoNotice[];
  healthy?: boolean;
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

export function useCastVideoNotices(options?: {
  department?: string;
  emergencyOnly?: boolean;
  enabled?: boolean;
  debug?: boolean;
}) {
  const [activeNotice, setActiveNotice] = useState<CastVideoNotice | null>(null);
  const [queue, setQueue] = useState<CastVideoNotice[]>([]);
  const department = options?.department ?? "staff_whiteboard";
  const emergencyOnly = Boolean(options?.emergencyOnly);
  const enabled = options?.enabled !== false;
  const debug = Boolean(options?.debug);

  const query = useMemo(() => {
    const params = new URLSearchParams({ department });
    if (emergencyOnly) params.set("emergency", "1");
    return params.toString();
  }, [department, emergencyOnly]);

  const loadNotices = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchBoardJson<CastVideoResponse>({
      url: `/api/staff/cast-videos?${query}`,
      timeoutMs: CAST_VIDEO_TIMEOUT_MS,
      debug,
      cacheKey: `cast-videos:${query}`,
      keepLastGood: true
    });
    if (result.data) {
      setActiveNotice(result.data.activeNotice ?? null);
      setQueue(result.data.queue ?? []);
    }
  }, [debug, enabled, query]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void loadNotices(), emergencyOnly ? 0 : 400);
    const timer = window.setInterval(() => void loadNotices(), CAST_VIDEO_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [emergencyOnly, enabled, loadNotices]);

  return { activeNotice, queue, reload: loadNotices, viewerKey: getViewerKey() };
}

export async function trackCastVideoOpen(input: {
  notice_id: string;
  viewer_key: string;
  viewer_role?: string | null;
  viewer_location?: string | null;
}) {
  await fetch("/api/staff/cast-videos/acknowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "open", ...input })
  });
}

export async function trackCastVideoClose(input: {
  notice_id: string;
  viewer_key: string;
  watch_duration_ms: number;
  acknowledged: boolean;
  skipped: boolean;
}) {
  await fetch("/api/staff/cast-videos/acknowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "close", ...input })
  });
}
