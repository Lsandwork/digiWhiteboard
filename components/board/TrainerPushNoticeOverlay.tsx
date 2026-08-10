"use client";

import { Component } from "react";
import { OpsAlertBoard } from "@/components/ops-alert/OpsAlertBoard";
import { opsAlertFromTrainerPush } from "@/lib/ops-alert";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";
type TrainerPushNoticeOverlayProps = {
  notice: TrainerPushNotice;
  queue: TrainerPushNotice[];
  nowMs: number;
  clockTime: string;
  clockDate: string;
};

class TrainerOverlayErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function TrainerPushNoticeOverlayInner({
  notice,
  queue,
  clockTime,
  clockDate
}: TrainerPushNoticeOverlayProps) {
  const base = opsAlertFromTrainerPush(notice);
  const alert =
    queue.length > 1
      ? {
          ...base,
          note: [base.note, `${queue.length - 1} more in training queue`].filter(Boolean).join(" · ")
        }
      : base;

  return (
    <OpsAlertBoard
      alert={alert}
      layout="full"
      fullscreen
      clockTime={clockTime}
      clockDate={clockDate}
      lastUpdated={notice.updated_at ?? notice.requested_at}
      connection="live"
    />
  );
}

export function TrainerPushNoticeOverlay(props: TrainerPushNoticeOverlayProps) {
  return (
    <TrainerOverlayErrorBoundary>
      <TrainerPushNoticeOverlayInner {...props} />
    </TrainerOverlayErrorBoundary>
  );
}
