"use client";

import { useSearchParams } from "next/navigation";
import { BoardRenderErrorBoundary } from "@/components/board/BoardRenderErrorBoundary";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { LobbyErrorBoundary } from "@/components/lobby/LobbyErrorBoundary";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";

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
        <CastKeeperProvider
          displayType="lobby_whiteboard"
          route="/lobby/checkouts"
          enabled
          allowStaleReload={!chromecastReceiver}
        >
          <LobbyCheckoutBoard embeddedDisplayToken={embeddedDisplayToken} castKeeperMode />
        </CastKeeperProvider>
      </LobbyErrorBoundary>
    </BoardRenderErrorBoundary>
  );
}
