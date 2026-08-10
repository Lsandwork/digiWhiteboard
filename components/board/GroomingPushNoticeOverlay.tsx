"use client";

import { Component } from "react";
import { OpsAlertBoard } from "@/components/ops-alert/OpsAlertBoard";
import { opsAlertFromGroomingPush } from "@/lib/ops-alert";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import { formatBoardDateTime } from "@/lib/board-utils";

type GroomingPushNoticeOverlayProps = {
  notice: GroomingPushNotice;
  queue: GroomingPushNotice[];
  nowMs: number;
  clockTime: string;
  clockDate: string;
};

class GroomingOverlayErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function groomingClockFromMs(nowMs: number) {
  const formatted = formatBoardDateTime(new Date(nowMs));
  return {
    clockTime: formatted.time,
    clockDate: formatted.date
  };
}

function GroomingPushNoticeOverlayInner({
  notice,
  queue,
  clockTime,
  clockDate
}: GroomingPushNoticeOverlayProps) {
  const base = opsAlertFromGroomingPush(notice);
  const alert =
    queue.length > 1
      ? {
          ...base,
          note: [base.note, `${queue.length - 1} more in grooming queue`].filter(Boolean).join(" · ")
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

export function GroomingPushNoticeOverlay(props: GroomingPushNoticeOverlayProps) {
  return (
    <GroomingOverlayErrorBoundary>
      <GroomingPushNoticeOverlayInner {...props} />
    </GroomingOverlayErrorBoundary>
  );
}
