"use client";

import { useSearchParams } from "next/navigation";
import { BoardClient } from "@/components/BoardClient";
import { StaffCastLiteBoard } from "@/components/cast-lite/StaffCastLiteBoard";
import { defaultCastLiteOptions, parseCastLiteOptions } from "@/lib/whiteboard/cast-options";

/**
 * Laptop staff board uses BoardClient (live-board + aggregated overlays).
 * Cast/TV uses cast-lite + /api/whiteboard/state as the single source of truth
 * so Chromecast does not hammer Supabase with per-feature polls.
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

  const parsed = parseCastLiteOptions(searchParams);
  const options = {
    ...defaultCastLiteOptions("staff"),
    ...parsed,
    lowMotion: parsed.lowMotion !== false
  };

  return <StaffCastLiteBoard options={options} />;
}
