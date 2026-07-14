"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { BoardClient } from "@/components/BoardClient";
import { BoardRenderErrorBoundary } from "@/components/board/BoardRenderErrorBoundary";
import { CastDisplaySession } from "@/components/cast-lite/CastDisplaySession";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { LobbyErrorBoundary } from "@/components/lobby/LobbyErrorBoundary";
import { useRemoteCastReceiver } from "@/hooks/useRemoteCastReceiver";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { FITDOG_BRAND } from "@/lib/fitdog-dashboard/assets";

function ReceiverFrame({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#02060b] text-white">{children}</div>;
}

function BrandLockup({ title, subtitle, code }: { title: string; subtitle: string; code?: string | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <Image
        src={FITDOG_BRAND.logoBadge256}
        alt="Fitdog"
        width={120}
        height={120}
        className="rounded-full ring-2 ring-fitdog-orange/40"
        priority
      />
      <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-300 sm:text-2xl">{subtitle}</p>
      {code ? (
        <div className="mt-10 rounded-3xl border border-white/15 bg-white/5 px-10 py-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-fitdog-orange">Pairing code</p>
          <p className="mt-3 font-mono text-6xl font-black tracking-widest sm:text-7xl">{code}</p>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionBadge({ connection, lastError }: { connection: string; lastError: string | null }) {
  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-black/70 px-3 py-2 text-xs font-mono text-white/80">
      <div>remote-cast: {connection}</div>
      {lastError ? <div className="text-amber-300">{lastError}</div> : null}
    </div>
  );
}

export function RemoteCastReceiver() {
  const searchParams = useSearchParams();
  const debugBoard = searchParams.get("debugBoard") === "1";

  const runtime = useRemoteCastReceiver(debugBoard);

  // Persistent, aggressive wake lock — this display stays on for hours.
  // Renews wake lock only; silent video is started once and kept alive.
  useScreenWakeLock({ enabled: true, persistent: true, aggressive: true, renewIntervalMs: 8_000 });

  if (!runtime.ready) {
    return (
      <ReceiverFrame>
        <BrandLockup title="Fitdog Remote Whiteboard Cast" subtitle="Connecting to Fitdog…" />
        {debugBoard ? <ConnectionBadge connection={runtime.connection} lastError={runtime.lastError} /> : null}
      </ReceiverFrame>
    );
  }

  if (!runtime.paired) {
    return (
      <ReceiverFrame>
        <BrandLockup
          title="Fitdog Remote Whiteboard Cast"
          subtitle={
            runtime.pairingExpired
              ? "This code expired — a fresh code is being generated…"
              : "Enter this pairing code in the Admin Panel"
          }
          code={runtime.pairingCode ?? "…"}
        />
        {debugBoard ? <ConnectionBadge connection={runtime.connection} lastError={runtime.lastError} /> : null}
      </ReceiverFrame>
    );
  }

  const badge = debugBoard ? <ConnectionBadge connection={runtime.connection} lastError={runtime.lastError} /> : null;

  if (runtime.activeScreen === "lobby") {
    return (
      <ReceiverFrame>
        <CastDisplaySession receiver />
        <BoardRenderErrorBoundary label="Lobby Board" debugBoard={debugBoard}>
          <LobbyErrorBoundary debugBoard={debugBoard}>
            <LobbyCheckoutBoard key={`lobby-${runtime.refreshNonce}`} castKeeperMode />
          </LobbyErrorBoundary>
        </BoardRenderErrorBoundary>
        {badge}
      </ReceiverFrame>
    );
  }

  if (runtime.activeScreen === "staff") {
    return (
      <ReceiverFrame>
        <CastDisplaySession receiver />
        <BoardRenderErrorBoundary label="Staff Board" debugBoard={debugBoard}>
          <BoardClient key={`staff-${runtime.refreshNonce}`} castKeeperMode overlaysEnabled />
        </BoardRenderErrorBoundary>
        {badge}
      </ReceiverFrame>
    );
  }

  if (runtime.activeScreen === "blackout") {
    return (
      <ReceiverFrame>
        <BrandLockup title="Fitdog Digital Whiteboard" subtitle="Screen paused by admin" />
        {badge}
      </ReceiverFrame>
    );
  }

  return (
    <ReceiverFrame>
      <BrandLockup
        title="Fitdog Remote Whiteboard Cast"
        subtitle={runtime.displayName ? `${runtime.displayName} — waiting for admin command` : "Waiting for admin command"}
      />
      {badge}
    </ReceiverFrame>
  );
}
