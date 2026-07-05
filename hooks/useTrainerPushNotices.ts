"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";

const TRAINER_PUSH_POLL_MS = 3000;
const TRAINER_PUSH_TIMEOUT_MS = 3000;

type TrainerPushResponse = {
  activeNotice: TrainerPushNotice | null;
  queue: TrainerPushNotice[];
  healthy?: boolean;
};

export function useTrainerPushNotices() {
  const [activeNotice, setActiveNotice] = useState<TrainerPushNotice | null>(null);
  const [queue, setQueue] = useState<TrainerPushNotice[]>([]);

  const loadNotices = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TRAINER_PUSH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/staff/trainer-push", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await response.json()) as TrainerPushResponse;
      if (!response.ok) return;
      setActiveNotice(data.activeNotice ?? null);
      setQueue(data.queue ?? []);
    } catch {
      // Optional overlay — never break the dog board.
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotices(), 0);
    const timer = window.setInterval(() => void loadNotices(), TRAINER_PUSH_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadNotices]);

  return { activeNotice, queue, reload: loadNotices };
}
