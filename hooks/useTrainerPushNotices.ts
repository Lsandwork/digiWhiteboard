"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";

const TRAINER_PUSH_POLL_MS = 12_000;
const TRAINER_PUSH_TIMEOUT_MS = 4000;

type TrainerPushResponse = {
  activeNotice: TrainerPushNotice | null;
  queue: TrainerPushNotice[];
  healthy?: boolean;
};

export function useTrainerPushNotices(options?: { enabled?: boolean; debug?: boolean }) {
  const enabled = options?.enabled !== false;
  const debug = Boolean(options?.debug);
  const [activeNotice, setActiveNotice] = useState<TrainerPushNotice | null>(null);
  const [queue, setQueue] = useState<TrainerPushNotice[]>([]);

  const loadNotices = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchBoardJson<TrainerPushResponse>({
      url: "/api/staff/trainer-push",
      timeoutMs: TRAINER_PUSH_TIMEOUT_MS,
      debug,
      cacheKey: "trainer-push",
      keepLastGood: true
    });
    if (result.data) {
      setActiveNotice(result.data.activeNotice ?? null);
      setQueue(result.data.queue ?? []);
    }
  }, [debug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void loadNotices(), 500);
    const timer = window.setInterval(() => void loadNotices(), TRAINER_PUSH_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, loadNotices]);

  return { activeNotice, queue, reload: loadNotices };
}
