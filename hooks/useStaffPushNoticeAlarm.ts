"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import {
  playStaffPushNoticeAlarm,
  startStaffPushNoticeAlarmLoop,
  stopStaffPushNoticeAlarmLoop,
  unlockStaffPushNoticeAudio
} from "@/lib/staff/push-notice-alarm";

const BURST_FLASH_MS = 8000;

export function useStaffPushNoticeAlarm(notice: StaffPushNotice | null) {
  const lastNoticeIdRef = useRef<string | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const [isBursting, setIsBursting] = useState(false);

  useEffect(() => {
    void unlockStaffPushNoticeAudio();

    const unlockOnInteraction = () => {
      void unlockStaffPushNoticeAudio();
    };

    window.addEventListener("pointerdown", unlockOnInteraction, { once: true });
    window.addEventListener("keydown", unlockOnInteraction, { once: true });

    const unlockInterval = window.setInterval(() => {
      void unlockStaffPushNoticeAudio();
    }, 15000);

    return () => {
      window.removeEventListener("pointerdown", unlockOnInteraction);
      window.removeEventListener("keydown", unlockOnInteraction);
      window.clearInterval(unlockInterval);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      lastNoticeIdRef.current = null;
      setIsBursting(false);
      stopStaffPushNoticeAlarmLoop();
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
      playStaffPushNoticeAlarm();

      if (burstTimerRef.current != null) {
        window.clearTimeout(burstTimerRef.current);
      }
      burstTimerRef.current = window.setTimeout(() => {
        setIsBursting(false);
        burstTimerRef.current = null;
      }, BURST_FLASH_MS);
    }

    startStaffPushNoticeAlarmLoop(notice.id);

    return () => {
      stopStaffPushNoticeAlarmLoop();
    };
  }, [notice]);

  return isBursting;
}
