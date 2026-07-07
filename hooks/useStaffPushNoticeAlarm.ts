"use client";

import type { StaffPushNotice } from "@/lib/staff/push-notices";

/** Visual alert state while a push notice is active. Audio is handled by useFitdogAlertSound. */
export function useStaffPushNoticeAlarm(notice: StaffPushNotice | null) {
  return Boolean(notice);
}
