"use client";

import { useSearchParams } from "next/navigation";
import { BoardClient } from "@/components/BoardClient";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";
import { useDisplaySync } from "@/hooks/useDisplaySync";

/**
 * Staff board — same rich layout everywhere (laptop, cast target, direct display URL).
 * Every staff whiteboard URL listens for admin Refresh / Hard Refresh Cast TVs.
 * Cast/TV additionally wraps the board in Cast Keeper for wake-lock and heartbeats.
 */
export function StaffBoardPageClient() {
  const searchParams = useSearchParams();
  const chromecastReceiver = searchParams.get("chromecast") === "1";
  const tvDisplay = searchParams.get("display") === "tv";
  const castMode = searchParams.get("castMode") === "1";
  const castDisplayMode = chromecastReceiver || tvDisplay || castMode;

  useDisplaySync({ enabled: true });

  if (!castDisplayMode) {
    return <BoardClient />;
  }

  return (
    <CastKeeperProvider
      displayType="staff_whiteboard"
      route="/"
      enabled
      allowStaleReload={!chromecastReceiver}
    >
      <BoardClient castKeeperMode overlaysEnabled />
    </CastKeeperProvider>
  );
}
