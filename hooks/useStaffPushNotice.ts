"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

const STAFF_PUSH_NOTICE_POLL_MS = 12_000;
const STAFF_PUSH_NOTICE_TIMEOUT_MS = 4000;

type StaffPushNoticeResponse = {
  activeNotice: StaffPushNotice | null;
  healthy?: boolean;
};

export function useStaffPushNotice(options?: { enabled?: boolean; debug?: boolean }) {
  const enabled = options?.enabled !== false;
  const debug = Boolean(options?.debug);
  const [activeNotice, setActiveNotice] = useState<StaffPushNotice | null>(null);

  const loadNotice = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchBoardJson<StaffPushNoticeResponse>({
      url: "/api/staff/push-notices",
      timeoutMs: STAFF_PUSH_NOTICE_TIMEOUT_MS,
      debug,
      cacheKey: "staff-push-notice",
      keepLastGood: true
    });
    if (result.data) {
      setActiveNotice(result.data.activeNotice ?? null);
    }
  }, [debug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void loadNotice(), 0);
    const timer = window.setInterval(() => void loadNotice(), STAFF_PUSH_NOTICE_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, loadNotice]);

  return activeNotice;
}
