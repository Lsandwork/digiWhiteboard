"use client";

import { useEffect, useRef } from "react";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import {
  playStaffPushNoticeAlarm,
  startStaffPushNoticeAlarmLoop,
  stopStaffPushNoticeAlarmLoop,
  unlockStaffPushNoticeAudio
} from "@/lib/staff/push-notice-alarm";

export function useStaffPushNoticeAlarm(notice: StaffPushNotice | null) {
  const lastNoticeIdRef = useRef<string | null>(null);

  useEffect(() => {
    void unlockStaffPushNoticeAudio();

    const unlockOnInteraction = () => {
      void unlockStaffPushNoticeAudio();
    };

    window.addEventListener("pointerdown", unlockOnInteraction, { once: true });
    window.addEventListener("keydown", unlockOnInteraction, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockOnInteraction);
      window.removeEventListener("keydown", unlockOnInteraction);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      lastNoticeIdRef.current = null;
      stopStaffPushNoticeAlarmLoop();
      return;
    }

    const isNewNotice = notice.id !== lastNoticeIdRef.current;
    if (isNewNotice) {
      lastNoticeIdRef.current = notice.id;
      playStaffPushNoticeAlarm();
    }

    startStaffPushNoticeAlarmLoop(notice.id);

    return () => {
      stopStaffPushNoticeAlarmLoop();
    };
  }, [notice]);
}
