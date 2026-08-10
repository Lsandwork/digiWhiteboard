"use client";

import { OpsAlertBoard } from "@/components/ops-alert/OpsAlertBoard";
import { opsAlertFromStaffPushNotice } from "@/lib/ops-alert";
import { isDailyReminderPushNotice, type StaffPushNotice } from "@/lib/staff/push-notices";

export function StaffPushNoticeTvOverlay({ active, notice }: { active: boolean; notice?: StaffPushNotice | null }) {
  // Legacy TV flash chrome removed — the master OpsAlert board is the only alert UI.
  if (!active || !notice) return null;
  return null;
}

export function StaffPushNoticePanel({ notice }: { notice: StaffPushNotice }) {
  const alert = opsAlertFromStaffPushNotice(notice);
  const isDailyReminder = isDailyReminderPushNotice(notice);
  return (
    <aside
      className="ops-alert-panel"
      aria-label={isDailyReminder ? "Active daily reminder" : "Active yard handler alert"}
      style={{
        display: "flex",
        minHeight: 0,
        height: "100%",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "0.25rem"
      }}
    >
      <OpsAlertBoard alert={alert} layout="card" compact fullscreen={false} />
    </aside>
  );
}

export function StaffPushNoticeFullscreen({
  notice,
  clockTime,
  clockDate,
  lastUpdated,
  connection
}: {
  notice: StaffPushNotice;
  clockTime?: string;
  clockDate?: string;
  lastUpdated?: string;
  connection?: "connecting" | "live" | "polling" | "offline";
}) {
  const alert = opsAlertFromStaffPushNotice(notice);
  return (
    <OpsAlertBoard
      alert={alert}
      layout="full"
      fullscreen
      clockTime={clockTime}
      clockDate={clockDate}
      lastUpdated={lastUpdated}
      connection={connection ?? "polling"}
    />
  );
}
