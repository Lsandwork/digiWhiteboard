"use client";

import { useMemo } from "react";
import { CastVideoOverlay } from "@/components/board/CastVideoOverlay";
import { GroomingPushNoticeOverlay, groomingClockFromMs } from "@/components/board/GroomingPushNoticeOverlay";
import { PushNoticeBoardVeil } from "@/components/board/PushNoticeFlashLayers";
import { StaffPushNoticeFullscreen } from "@/components/board/StaffPushNotice";
import { TrainerPushNoticeOverlay } from "@/components/board/TrainerPushNoticeOverlay";
import { useLaBoardNow } from "@/components/boards/TlBoardClock";
import { useFitdogAlertSound } from "@/hooks/useFitdogAlertSound";
import { useStaffBoardOverlays } from "@/hooks/useStaffBoardOverlays";
import { formatLaBoardDate, formatLaBoardLiveClock } from "@/lib/tl-digi-board/medication-windows";

function isTimedPushStillActive(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

/**
 * Full-screen staff push overlays for the TL Alerts TV.
 * Polls the same overlay sources as the staff whiteboard on a separate cadence
 * so Gingr snapshot loads stay untouched.
 */
export function TlBoardPushTakeover() {
  const now = useLaBoardNow();
  const nowMs = now?.getTime() ?? Date.now();
  const clockTime = now ? formatLaBoardLiveClock(now) : "--:--:--";
  const clockDate = now ? formatLaBoardDate(now) : "LOADING";

  const {
    activePushNotice,
    emergencyCastVideo,
    emergencyCastQueue,
    activeCastVideo,
    castVideoQueue,
    activeGroomingNotice,
    groomingQueue,
    activeTrainerNotice,
    trainerQueue,
    reload: reloadOverlays,
    viewerKey: castViewerKey
  } = useStaffBoardOverlays({ department: "tl_alerts_reminders" });

  const effectiveGroomingNotice =
    activeGroomingNotice && isTimedPushStillActive(activeGroomingNotice.expires_at, nowMs)
      ? activeGroomingNotice
      : null;
  const effectiveTrainerNotice =
    activeTrainerNotice && isTimedPushStillActive(activeTrainerNotice.expires_at, nowMs)
      ? activeTrainerNotice
      : null;
  const effectiveCastVideo =
    activeCastVideo && isTimedPushStillActive(activeCastVideo.expires_at, nowMs) ? activeCastVideo : null;
  const effectiveEmergencyCastVideo =
    emergencyCastVideo && isTimedPushStillActive(emergencyCastVideo.expires_at, nowMs)
      ? emergencyCastVideo
      : null;
  const effectivePushNotice = activePushNotice ?? null;

  const activeNoticeAlertKey = useMemo(() => {
    if (effectiveEmergencyCastVideo) return `emergency-video:${effectiveEmergencyCastVideo.id}`;
    const isEmergencyStaffPush = Boolean(
      effectivePushNotice &&
        (effectivePushNotice.priority === "urgent" || effectivePushNotice.display_mode === "urgent")
    );
    if (isEmergencyStaffPush && effectivePushNotice) return `push:${effectivePushNotice.id}`;
    if (effectiveGroomingNotice) return `grooming:${effectiveGroomingNotice.id}`;
    if (effectiveTrainerNotice) return `trainer:${effectiveTrainerNotice.id}`;
    if (effectiveCastVideo) return `video:${effectiveCastVideo.id}`;
    if (effectivePushNotice) return `push:${effectivePushNotice.id}`;
    return null;
  }, [
    effectiveCastVideo,
    effectiveEmergencyCastVideo,
    effectiveGroomingNotice,
    effectivePushNotice,
    effectiveTrainerNotice
  ]);

  useFitdogAlertSound(activeNoticeAlertKey);

  const groomingClock = groomingClockFromMs(nowMs);

  const takeover = useMemo(() => {
    if (effectiveEmergencyCastVideo) {
      return {
        kind: "emergency-cast" as const,
        notice: effectiveEmergencyCastVideo,
        queue: emergencyCastQueue
      };
    }
    const isEmergencyStaffPush = Boolean(
      effectivePushNotice &&
        (effectivePushNotice.priority === "urgent" || effectivePushNotice.display_mode === "urgent")
    );
    if (isEmergencyStaffPush && effectivePushNotice) {
      return { kind: "push" as const, notice: effectivePushNotice };
    }
    if (effectiveGroomingNotice) {
      return { kind: "grooming" as const, notice: effectiveGroomingNotice, queue: groomingQueue };
    }
    if (effectiveTrainerNotice) {
      return { kind: "trainer" as const, notice: effectiveTrainerNotice, queue: trainerQueue };
    }
    if (effectiveCastVideo) {
      return { kind: "cast" as const, notice: effectiveCastVideo, queue: castVideoQueue };
    }
    if (effectivePushNotice) {
      return { kind: "push" as const, notice: effectivePushNotice };
    }
    return null;
  }, [
    castVideoQueue,
    effectiveCastVideo,
    effectiveEmergencyCastVideo,
    effectiveGroomingNotice,
    effectivePushNotice,
    effectiveTrainerNotice,
    emergencyCastQueue,
    groomingQueue,
    trainerQueue
  ]);

  if (!takeover) return null;

  return (
    <div className="tl-board-push-takeover" role="alert" aria-live="assertive">
      <PushNoticeBoardVeil active tone="alert" />
      {takeover.kind === "emergency-cast" || takeover.kind === "cast" ? (
        <CastVideoOverlay
          notice={takeover.notice}
          queue={takeover.queue}
          viewerKey={castViewerKey}
          viewerLocation="tl_alerts_reminders"
          onDismiss={() => void reloadOverlays()}
        />
      ) : takeover.kind === "grooming" ? (
        <GroomingPushNoticeOverlay
          notice={takeover.notice}
          queue={takeover.queue}
          nowMs={nowMs}
          clockTime={groomingClock.clockTime}
          clockDate={groomingClock.clockDate}
        />
      ) : takeover.kind === "trainer" ? (
        <TrainerPushNoticeOverlay
          notice={takeover.notice}
          queue={takeover.queue}
          nowMs={nowMs}
          clockTime={groomingClock.clockTime}
          clockDate={groomingClock.clockDate}
        />
      ) : (
        <StaffPushNoticeFullscreen
          notice={takeover.notice}
          clockTime={clockTime}
          clockDate={clockDate}
          lastUpdated={takeover.notice.updated_at ?? takeover.notice.created_at}
          connection="polling"
        />
      )}
    </div>
  );
}
