"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";

const GROOMING_PUSH_POLL_MS = 12_000;
const GROOMING_PUSH_TIMEOUT_MS = 4000;

type GroomingPushResponse = {
  activeNotice: GroomingPushNotice | null;
  queue: GroomingPushNotice[];
  healthy?: boolean;
};

export function useGroomingPushNotices(options?: { enabled?: boolean; debug?: boolean }) {
  const enabled = options?.enabled !== false;
  const debug = Boolean(options?.debug);
  const [activeNotice, setActiveNotice] = useState<GroomingPushNotice | null>(null);
  const [queue, setQueue] = useState<GroomingPushNotice[]>([]);

  const loadNotices = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchBoardJson<GroomingPushResponse>({
      url: "/api/staff/grooming-push",
      timeoutMs: GROOMING_PUSH_TIMEOUT_MS,
      debug,
      cacheKey: "grooming-push",
      keepLastGood: true
    });
    if (result.data) {
      setActiveNotice(result.data.activeNotice ?? null);
      setQueue(result.data.queue ?? []);
    }
  }, [debug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void loadNotices(), 250);
    const timer = window.setInterval(() => void loadNotices(), GROOMING_PUSH_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, loadNotices]);

  return { activeNotice, queue, reload: loadNotices };
}
