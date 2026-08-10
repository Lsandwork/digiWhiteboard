"use client";

import { OpsAlertBoard } from "@/components/ops-alert/OpsAlertBoard";
import { opsAlertFromActiveAlert, opsAlertFromStaffPushNotice } from "@/lib/ops-alert";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import type { StaffActiveAlert } from "@/lib/whiteboard/staff-active-alert";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type StaffAlertTakeoverProps = {
  notice?: StaffPushNotice;
  alert?: StaffActiveAlert;
  clockTime?: string;
  clockDate?: string;
  lastUpdated?: string;
  connection?: ConnectionState;
  lowMotion?: boolean;
  layout?: "full" | "header" | "card";
  fullscreen?: boolean;
};

function resolveViewModel(notice?: StaffPushNotice, alert?: StaffActiveAlert) {
  if (notice) return opsAlertFromStaffPushNotice(notice);
  if (alert) return opsAlertFromActiveAlert(alert);
  return null;
}

/** Master card — every staff push / daily reminder renders through OpsAlert. */
export function StaffAlertCard({
  notice,
  alert,
  fullscreen = false,
  lowMotion = false
}: {
  notice?: StaffPushNotice;
  alert?: StaffActiveAlert;
  fullscreen?: boolean;
  lowMotion?: boolean;
}) {
  const viewModel = resolveViewModel(notice, alert);
  if (!viewModel) return null;

  return (
    <OpsAlertBoard
      alert={viewModel}
      layout="card"
      fullscreen={fullscreen}
      compact={!fullscreen}
      lowMotion={lowMotion}
    />
  );
}

/** Full operations-board chrome + master alert card (approved design). */
export function StaffAlertTakeover({
  notice,
  alert,
  clockTime = "--:--",
  clockDate = "LOADING",
  lastUpdated,
  connection = "polling",
  lowMotion = false,
  layout = "full",
  fullscreen = true
}: StaffAlertTakeoverProps) {
  const viewModel = resolveViewModel(notice, alert);
  if (!viewModel) return null;

  // "header" legacy layout still gets the full approved board chrome — the
  // reference image is one composition, not a partial strip.
  const boardLayout = layout === "card" ? "card" : "full";

  return (
    <OpsAlertBoard
      alert={viewModel}
      clockTime={clockTime}
      clockDate={clockDate}
      lastUpdated={lastUpdated}
      connection={connection}
      lowMotion={lowMotion}
      layout={boardLayout}
      fullscreen={fullscreen}
      compact={boardLayout === "card" && !fullscreen}
    />
  );
}
