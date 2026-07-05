"use client";

import { useCallback, useEffect, useState } from "react";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const GROOMING_PUSH_POLL_MS = 3000;
const GROOMING_PUSH_TIMEOUT_MS = 3000;

type GroomingPushResponse = {
  activeNotice: GroomingPushNotice | null;
  queue: GroomingPushNotice[];
  healthy?: boolean;
};

export function useGroomingPushNotices() {
  const [activeNotice, setActiveNotice] = useState<GroomingPushNotice | null>(null);
  const [queue, setQueue] = useState<GroomingPushNotice[]>([]);

  const loadNotices = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), GROOMING_PUSH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/staff/grooming-push", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await response.json()) as GroomingPushResponse;
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
    const timer = window.setInterval(() => void loadNotices(), GROOMING_PUSH_POLL_MS);

    let channel: { unsubscribe?: () => void } | null = null;
    try {
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("Supabase unavailable");
      channel = supabase
        .channel("grooming-push-notices")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "grooming_push_notices" },
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
  }, [loadNotices]);

  return { activeNotice, queue, reload: loadNotices };
}
