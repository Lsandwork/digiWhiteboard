"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const CAST_VIDEO_POLL_MS = 3000;
const CAST_VIDEO_TIMEOUT_MS = 3000;

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

export function useCastVideoNotices(options?: { department?: string; emergencyOnly?: boolean }) {
  const [activeNotice, setActiveNotice] = useState<CastVideoNotice | null>(null);
  const [queue, setQueue] = useState<CastVideoNotice[]>([]);
  const department = options?.department ?? "staff_whiteboard";
  const emergencyOnly = Boolean(options?.emergencyOnly);

  const query = useMemo(() => {
    const params = new URLSearchParams({ department });
    if (emergencyOnly) params.set("emergency", "1");
    return params.toString();
  }, [department, emergencyOnly]);

  const loadNotices = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CAST_VIDEO_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/staff/cast-videos?${query}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await response.json()) as CastVideoResponse;
      if (!response.ok) return;
      setActiveNotice(data.activeNotice ?? null);
      setQueue(data.queue ?? []);
    } catch {
      // Optional overlay — never break the dog board.
    } finally {
      window.clearTimeout(timeout);
    }
  }, [query]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotices(), 0);
    const timer = window.setInterval(() => void loadNotices(), CAST_VIDEO_POLL_MS);

    let channel: { unsubscribe?: () => void } | null = null;
    try {
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("Supabase unavailable");
      channel = supabase
        .channel(`cast-video-notices-${department}-${emergencyOnly ? "emergency" : "regular"}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cast_video_notices" },
          () => void loadNotices()
        )
        .subscribe();
    } catch {
      // Realtime is optional; polling remains the fallback.
    }

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      if (channel) {
        try {
          const supabase = getBrowserSupabase();
          if (supabase) void supabase.removeChannel(channel as never);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [department, emergencyOnly, loadNotices]);

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
