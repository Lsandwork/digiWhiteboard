"use client";

import { useEffect, useRef } from "react";
import { playStaffPushNoticeAlarm, unlockStaffPushNoticeAudio } from "@/lib/staff/push-notice-alarm";

/** Plays the Fitdog alert sound once when `alertKey` changes to a new non-null value. */
export function useFitdogAlertSound(alertKey: string | null) {
  const lastKeyRef = useRef<string | null>(null);
  const replayedOnInteractionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void unlockStaffPushNoticeAudio();

    const unlockOnInteraction = () => {
      void unlockStaffPushNoticeAudio().finally(() => {
        const activeKey = lastKeyRef.current;
        if (!activeKey || replayedOnInteractionKeyRef.current === activeKey) return;
        replayedOnInteractionKeyRef.current = activeKey;
        void playStaffPushNoticeAlarm();
      });
    };

    window.addEventListener("pointerdown", unlockOnInteraction);
    window.addEventListener("keydown", unlockOnInteraction);

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
    if (!alertKey) {
      lastKeyRef.current = null;
      replayedOnInteractionKeyRef.current = null;
      return;
    }

    if (alertKey !== lastKeyRef.current) {
      lastKeyRef.current = alertKey;
      replayedOnInteractionKeyRef.current = null;
      void playStaffPushNoticeAlarm();
    }
  }, [alertKey]);
}
