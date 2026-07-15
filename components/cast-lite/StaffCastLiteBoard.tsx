"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CastLiteClock } from "@/components/cast-lite/CastLiteClock";
import { CastLiteDebugPanel } from "@/components/cast-lite/CastLiteDebugPanel";
import { CastLiteDogCard } from "@/components/cast-lite/CastLiteDogCard";
import { StaffCastLiteSenderButton } from "@/components/cast-lite/StaffCastLiteSenderButton";
import { CastLiteVideoPlayer } from "@/components/cast-lite/CastLiteVideoPlayer";
import { groomingClockFromMs } from "@/components/board/GroomingPushNoticeOverlay";
import { PushNoticeBoardVeil } from "@/components/board/PushNoticeFlashLayers";
import { StaffAlertTakeover } from "@/components/whiteboard/StaffAlertTakeover";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import { useFitdogAlertSound } from "@/hooks/useFitdogAlertSound";
import { useWhiteboardCastState } from "@/hooks/useWhiteboardCastState";
import { CastDisplaySession } from "@/components/cast-lite/CastDisplaySession";
import { formatBoardDateTime } from "@/lib/board-utils";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import type { CastLiteOptions } from "@/lib/whiteboard/cast-options";
import {
  WHITEBOARD_STATE_ALERT_POLL_MS,
  WHITEBOARD_STATE_POLL_MS,
  type CastLiteDog,
  type CastLiteGroomingPush,
  type StaffWhiteboardStatePayload
} from "@/lib/whiteboard/state";
import { resolveStaffCastDisplay } from "@/lib/whiteboard/staff-active-alert";

const GroomingPushNoticeOverlay = dynamic(
  () => import("@/components/board/GroomingPushNoticeOverlay").then((mod) => mod.GroomingPushNoticeOverlay),
  { ssr: false }
);

type StaffCastLiteBoardProps = {
  options: CastLiteOptions;
};

function castGroomingToNotice(push: CastLiteGroomingPush): GroomingPushNotice {
  return {
    id: push.id,
    dog_id: push.dog_id,
    dog_name: push.dog_name,
    dog_photo_url: push.dog_photo_url,
    owner_name: push.owner_name,
    owner_initial: push.owner_initial,
    service: push.service,
    groomer_name: push.groomer_name,
    action: push.action,
    notes: push.notes,
    safety_tags: push.safety_tags,
    status: "active",
    requested_by: null,
    requested_at: push.requested_at,
    expires_at: push.expires_at,
    cleared_at: null,
    cleared_by: null,
    created_at: push.requested_at,
    updated_at: push.requested_at,
    gingr_display_status: push.gingr_display_status,
    user_notes: push.user_notes
  };
}

function newestCastLiteCheckoutAlertSoundKey(dogs: CastLiteDog[]) {
  if (!dogs.length) return null;

  const newest = dogs.reduce((latest, dog) => {
    const latestAt = new Date(latest.status_started_at ?? 0).getTime();
    const dogAt = new Date(dog.status_started_at ?? 0).getTime();
    return dogAt >= latestAt ? dog : latest;
  });
  const anchor = newest.status_started_at ?? newest.id;
  const dogKey = newest.gingr_animal_id ?? newest.id;
  return `checkout:${dogKey}:${anchor}`;
}

const StaffCastPanels = memo(function StaffCastPanels({
  payload,
  lowMotion
}: {
  payload: StaffWhiteboardStatePayload;
  lowMotion: boolean;
}) {
  return (
    <div className="cast-lite-staff-grid">
      <section className="cast-lite-panel cast-lite-panel--in">
        <header className="cast-lite-panel__header">
          <h2>Checking In</h2>
          <span>{payload.checkingInDogs.length}</span>
        </header>
        <div className="cast-lite-panel__list">
          {payload.checkingInDogs.length ? (
            payload.checkingInDogs.map((dog) => (
              <CastLiteDogCard key={dog.id} dog={dog} mode="in" lowMotion={lowMotion} />
            ))
          ) : (
            <p className="cast-lite-empty">No dogs checking in right now.</p>
          )}
        </div>
      </section>

      <section className="cast-lite-panel cast-lite-panel--out">
        <header className="cast-lite-panel__header">
          <h2>Checking Out</h2>
          <span>{payload.checkingOutDogs.length}</span>
        </header>
        <div className="cast-lite-panel__list">
          {payload.checkingOutDogs.length ? (
            payload.checkingOutDogs.map((dog) => (
              <CastLiteDogCard key={dog.id} dog={dog} mode="out" lowMotion={lowMotion} />
            ))
          ) : (
            <p className="cast-lite-empty">No dogs checking out right now.</p>
          )}
        </div>
      </section>
    </div>
  );
});

function useCastBoardClock(activeAlert: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const intervalMs = activeAlert ? 5_000 : 60_000;
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [activeAlert]);

  const formatted = useMemo(() => groomingClockFromMs(nowMs), [nowMs]);
  return { nowMs, ...formatted };
}

function StaffCastLiteContent({
  options,
  chromecastReceiver
}: StaffCastLiteBoardProps & { chromecastReceiver: boolean }) {
  const castKeeper = useCastKeeperContext();
  const lowMotion = options.lowMotion !== false || chromecastReceiver;
  const [alertPolling, setAlertPolling] = useState(false);
  const pollMs = alertPolling ? WHITEBOARD_STATE_ALERT_POLL_MS : WHITEBOARD_STATE_POLL_MS;

  const { state, health, showReconnecting, refresh } = useWhiteboardCastState({
    board: "staff",
    noVideo: options.noVideo,
    pollMs,
    enabled: true,
    realtime: true,
    debug: options.debugBoard
  });

  useEffect(() => {
    if (state?.updatedAt) {
      castKeeper?.markDataFresh();
    }
  }, [castKeeper, state?.updatedAt, state?.version]);

  useEffect(() => {
    document.documentElement.classList.add("cast-lite-mode", "cast-performance-mode");
    if (chromecastReceiver) document.documentElement.classList.add("staff-tv-display", "chromecast-receiver");
    if (lowMotion || chromecastReceiver) document.documentElement.classList.add("cast-lite-low-motion");
    return () => {
      document.documentElement.classList.remove(
        "cast-lite-mode",
        "cast-performance-mode",
        "staff-tv-display",
        "cast-lite-low-motion",
        "chromecast-receiver"
      );
    };
  }, [chromecastReceiver, lowMotion]);

  const castSenderChrome = chromecastReceiver ? null : <StaffCastLiteSenderButton />;

  useEffect(() => {
    const handleRefresh = () => void refresh();
    window.addEventListener("fitdog-cast-keeper-refresh", handleRefresh);
    return () => window.removeEventListener("fitdog-cast-keeper-refresh", handleRefresh);
  }, [refresh]);

  const payload = state?.payload.boardType === "staff" ? state.payload : null;
  const display = useMemo(
    () => (payload ? resolveStaffCastDisplay(payload, { noVideo: options.noVideo }) : { mode: "dashboard" as const }),
    [payload, options.noVideo]
  );

  const hasActiveAlert = display.mode !== "dashboard";
  const clock = useCastBoardClock(hasActiveAlert);

  useEffect(() => {
    const timer = window.setTimeout(() => setAlertPolling(hasActiveAlert), 0);
    return () => window.clearTimeout(timer);
  }, [hasActiveAlert]);

  const lastUpdated = payload?.lastUpdated ?? state?.updatedAt ?? new Date().toISOString();
  const lastUpdatedLabel = useMemo(() => formatBoardDateTime(new Date(lastUpdated)).time, [lastUpdated]);

  const debugAlert =
    display.mode === "push_takeover"
      ? display.alert
      : display.mode === "grooming_takeover"
        ? { id: display.grooming.id, type: "grooming_push" as const }
        : display.mode === "video_takeover"
          ? { id: display.video.id, type: "cast_video" as const }
          : null;
  const checkoutAlertSoundKey = useMemo(
    () => newestCastLiteCheckoutAlertSoundKey(payload?.checkingOutDogs ?? []),
    [payload?.checkingOutDogs]
  );
  const alertSoundKey =
    display.mode === "push_takeover" ? `push:${display.alert.id}` :
    display.mode === "grooming_takeover" ? `grooming:${display.grooming.id}` :
    display.mode === "video_takeover" ? `video:${display.video.id}` :
    checkoutAlertSoundKey;
  useFitdogAlertSound(alertSoundKey);

  if (display.mode === "push_takeover") {
    return (
      <main className="board-shell cast-lite-shell cast-lite-shell--staff flex min-h-screen flex-col overflow-hidden text-white">
        <CastDisplaySession receiver={chromecastReceiver} />
        <StaffAlertTakeover
          alert={display.alert}
          clockTime={clock.clockTime}
          clockDate={clock.clockDate}
          lastUpdated={lastUpdated}
          connection="polling"
          lowMotion={lowMotion}
          layout="full"
        />
        {showReconnecting ? <p className="cast-lite-reconnect">Reconnecting…</p> : null}
        {castSenderChrome}
        {options.debugBoard ? (
          <CastLiteDebugPanel
            health={health}
            showReconnecting={showReconnecting}
            activeAlert={true}
            alertId={display.alert.id}
            alertType={display.alert.type}
            stateVersion={state?.version ?? null}
          />
        ) : null}
      </main>
    );
  }

  if (display.mode === "grooming_takeover") {
    const groomingNotice = castGroomingToNotice(display.grooming);
    return (
      <main className="board-shell cast-lite-shell cast-lite-shell--staff flex min-h-screen flex-col overflow-hidden text-white">
        <CastDisplaySession receiver={chromecastReceiver} />
        <PushNoticeBoardVeil active tone="grooming" label="Grooming Push Active" />
        <div className="fitdog-tv-stage--staff flex min-h-0 flex-1 flex-col">
          <GroomingPushNoticeOverlay
            notice={groomingNotice}
            queue={[]}
            nowMs={clock.nowMs}
            clockTime={clock.clockTime}
            clockDate={clock.clockDate}
          />
        </div>
        {showReconnecting ? <p className="cast-lite-reconnect">Reconnecting…</p> : null}
        {castSenderChrome}
        {options.debugBoard ? (
          <CastLiteDebugPanel
            health={health}
            showReconnecting={showReconnecting}
            activeAlert={true}
            alertId={display.grooming.id}
            alertType="grooming_push"
            stateVersion={state?.version ?? null}
          />
        ) : null}
      </main>
    );
  }

  if (display.mode === "video_takeover") {
    return (
      <main className="board-shell cast-lite-shell cast-lite-shell--staff cast-lite-shell--video flex min-h-screen flex-col overflow-hidden text-white">
        <CastDisplaySession receiver={chromecastReceiver} />
        <PushNoticeBoardVeil active tone="cast" label="Video Cast Active" />
        <div className="cast-lite-video-stage mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col px-4 py-4">
          <header className="cast-lite-video-stage__header">
            <div>
              <p className="cast-lite-video-stage__title">Fitdog Health & Social Club</p>
              <p className="cast-lite-video-stage__subtitle">Video cast active</p>
            </div>
            <div className="text-right">
              <p className="cast-lite-video-stage__clock">{clock.clockTime}</p>
              <p className="cast-lite-video-stage__date">{clock.clockDate}</p>
            </div>
          </header>
          <CastLiteVideoPlayer notice={display.video} lowMotion={lowMotion} />
        </div>
        {showReconnecting ? <p className="cast-lite-reconnect">Reconnecting…</p> : null}
        {castSenderChrome}
        {options.debugBoard ? (
          <CastLiteDebugPanel
            health={health}
            showReconnecting={showReconnecting}
            activeAlert={true}
            alertId={display.video.id}
            alertType="cast_video"
            stateVersion={state?.version ?? null}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="cast-lite-shell cast-lite-shell--staff">
      <CastDisplaySession receiver={chromecastReceiver} />
      <header className="cast-lite-header">
        <div className="cast-lite-brand">
          <p className="cast-lite-brand__title">Staff Digital Whiteboard</p>
          <p className="cast-lite-brand__subtitle">Cast Mode</p>
        </div>
        <CastLiteClock />
      </header>

      {showReconnecting ? <p className="cast-lite-reconnect">Reconnecting…</p> : null}

      {payload ? <StaffCastPanels payload={payload} lowMotion={lowMotion} /> : null}

      {castSenderChrome}

      {options.debugBoard ? (
        <CastLiteDebugPanel
          health={health}
          showReconnecting={showReconnecting}
          activeAlert={false}
          alertId={debugAlert?.id ?? null}
          alertType={debugAlert?.type ?? null}
          stateVersion={state?.version ?? null}
        />
      ) : null}
    </main>
  );
}

export function StaffCastLiteBoard({ options }: StaffCastLiteBoardProps) {
  const searchParams = useSearchParams();
  const chromecastReceiver =
    searchParams.get("chromecast") === "1" || searchParams.get("display") === "tv";

  return (
    <CastKeeperProvider
      displayType="staff_whiteboard"
      route="/staff-cast"
      enabled
      allowStaleReload={!chromecastReceiver}
    >
      <StaffCastLiteContent options={options} chromecastReceiver={chromecastReceiver} />
    </CastKeeperProvider>
  );
}
