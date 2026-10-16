import { NextResponse } from "next/server";
import { emptyStaffBoardOverlays, loadStaffBoardOverlays } from "@/lib/staff/board-overlays";
import { invalidateBoardOverlayCaches } from "@/lib/board-settings-cache";
import { debugBoardLog } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debugBoard = url.searchParams.get("debugBoard") === "1";
  const fresh = url.searchParams.get("fresh") === "1";
  const department = url.searchParams.get("department")?.trim() || "staff_whiteboard";
  const startedAt = Date.now();

  try {
    // Event-driven fetch: drop this instance's overlay caches so a change
    // broadcast can never be answered with pre-change data. Polls without
    // `fresh` keep the shared TTL cache that bounds Supabase reads.
    if (fresh) invalidateBoardOverlayCaches();
    const overlays = await loadStaffBoardOverlays(getServiceSupabase(), { department });
    debugBoardLog(debugBoard, "board overlays ok", {
      department,
      durationMs: Date.now() - startedAt,
      healthy: overlays.healthy
    });
    return NextResponse.json(overlays, {
      headers: {
        "cache-control": fresh ? "private, no-store, max-age=0" : "private, max-age=2, stale-while-revalidate=8"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load board overlays.";
    debugBoardLog(debugBoard, "board overlays failed", { department, error: message });
    return NextResponse.json(
      { ...emptyStaffBoardOverlays(), error: message },
      {
        status: 200,
        headers: {
          "cache-control": "private, max-age=1"
        }
      }
    );
  }
}
