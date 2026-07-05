"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

const BURST_FLASH_MS = 8000;

/** Visual burst state when a new push notice appears. Audio is handled by useFitdogAlertSound. */
export function useStaffPushNoticeAlarm(notice: StaffPushNotice | null) {
  const lastNoticeIdRef = useRef<string | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const [isBursting, setIsBursting] = useState(false);

  useEffect(() => {
    if (!notice) {
      lastNoticeIdRef.current = null;
      setIsBursting(false);
      if (burstTimerRef.current != null) {
        window.clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      return;
    }

    const isNewNotice = notice.id !== lastNoticeIdRef.current;
    if (isNewNotice) {
      lastNoticeIdRef.current = notice.id;
      setIsBursting(true);

      if (burstTimerRef.current != null) {
        window.clearTimeout(burstTimerRef.current);
      }
      burstTimerRef.current = window.setTimeout(() => {
        setIsBursting(false);
        burstTimerRef.current = null;
      }, BURST_FLASH_MS);
    }
  }, [notice]);

  return isBursting;
}
