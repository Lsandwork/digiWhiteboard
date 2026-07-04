"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

const STAFF_PUSH_NOTICE_POLL_MS = 3000;
const STAFF_PUSH_NOTICE_TIMEOUT_MS = 3000;

type StaffPushNoticeResponse = {
  activeNotice: StaffPushNotice | null;
  healthy?: boolean;
};

export function useStaffPushNotice() {
  const [activeNotice, setActiveNotice] = useState<StaffPushNotice | null>(null);

  const loadNotice = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), STAFF_PUSH_NOTICE_TIMEOUT_MS);

    try {
      const response = await fetch("/api/staff/push-notices", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await response.json()) as StaffPushNoticeResponse;
      if (!response.ok) return;
      setActiveNotice(data.activeNotice ?? null);
    } catch {
      // Push Notices are optional; keep the dog board working if this fetch fails.
      setActiveNotice(null);
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotice(), 0);
    const timer = window.setInterval(() => void loadNotice(), STAFF_PUSH_NOTICE_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadNotice]);

  return activeNotice;
}
