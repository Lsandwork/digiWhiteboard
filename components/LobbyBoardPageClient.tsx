"use client";

import { useSearchParams } from "next/navigation";
import { BoardRenderErrorBoundary } from "@/components/board/BoardRenderErrorBoundary";
import { CastDisplaySession } from "@/components/cast-lite/CastDisplaySession";
import { DisplayBootstrap } from "@/components/display/DisplayBootstrap";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { LobbyErrorBoundary } from "@/components/lobby/LobbyErrorBoundary";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import { DisplayClosedHoursGate } from "@/components/display/DisplayClosedHoursGate";

/**
 * Lobby board — same rich layout everywhere (laptop, cast target, direct display URL).
 * Cast/TV wraps the full board in the cast keeper for wake-lock, heartbeat, and
 * stale auto-reload reliability, then renders in TV layout via castKeeperMode.
 */
export function LobbyBoardPageClient({ embeddedDisplayToken }: { embeddedDisplayToken?: string }) {
  const searchParams = useSearchParams();
  const chromecastReceiver = searchParams.get("chromecast") === "1";
  const tvDisplay = searchParams.get("display") === "tv";
  const castMode = searchParams.get("castMode") === "1";
  const castDisplayMode = chromecastReceiver || tvDisplay || castMode;

  const debugBoard = searchParams.get("debugBoard") === "1";

  useDisplaySync({ enabled: !castDisplayMode });

  if (!castDisplayMode) {
    return (
      <BoardRenderErrorBoundary label="Lobby Board" debugBoard={debugBoard}>
        <LobbyErrorBoundary debugBoard={debugBoard}>
          <LobbyCheckoutBoard embeddedDisplayToken={embeddedDisplayToken} />
        </LobbyErrorBoundary>
      </BoardRenderErrorBoundary>
    );
  }

  return (
    <BoardRenderErrorBoundary label="Lobby Board" debugBoard={debugBoard}>
      <LobbyErrorBoundary debugBoard={debugBoard}>
        <DisplayClosedHoursGate>
          <LobbyCastDisplayBody
            chromecastReceiver={chromecastReceiver}
            tvDisplay={tvDisplay}
            castMode={castMode}
            embeddedDisplayToken={embeddedDisplayToken}
          />
        </DisplayClosedHoursGate>
      </LobbyErrorBoundary>
    </BoardRenderErrorBoundary>
  );
}

function LobbyCastDisplayBody({
  chromecastReceiver,
  tvDisplay,
  castMode,
  embeddedDisplayToken
}: {
  chromecastReceiver: boolean;
  tvDisplay: boolean;
  castMode: boolean;
  embeddedDisplayToken?: string;
}) {
  useDisplaySync({ enabled: true });
  return (
    <>
      <DisplayBootstrap />
      <CastKeeperProvider
        displayType="lobby_whiteboard"
        route="/lobby/checkouts"
        enabled
        allowStaleReload={!chromecastReceiver}
      >
        <CastDisplaySession receiver={chromecastReceiver || tvDisplay || castMode} />
        <LobbyCheckoutBoard embeddedDisplayToken={embeddedDisplayToken} castKeeperMode />
      </CastKeeperProvider>
    </>
  );
}
