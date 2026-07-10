"use client";

import { useSearchParams } from "next/navigation";
import { BoardClient } from "@/components/BoardClient";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";

/**
 * Staff board — same rich layout everywhere (laptop, cast target, direct display URL).
 * Cast/TV wraps the full board in the cast keeper for wake-lock, heartbeat, and
 * stale auto-reload reliability, then renders in TV layout via castKeeperMode.
 */
export function StaffBoardPageClient() {
  const searchParams = useSearchParams();
  const chromecastReceiver = searchParams.get("chromecast") === "1";
  const tvDisplay = searchParams.get("display") === "tv";
  const castMode = searchParams.get("castMode") === "1";
  const castDisplayMode = chromecastReceiver || tvDisplay || castMode;

  if (!castDisplayMode) {
    return <BoardClient />;
  }

  return (
    <CastKeeperProvider
      displayType="staff_whiteboard"
      route="/staff-cast"
      enabled
      allowStaleReload={!chromecastReceiver}
    >
      <BoardClient castKeeperMode overlaysEnabled />
    </CastKeeperProvider>
  );
}
