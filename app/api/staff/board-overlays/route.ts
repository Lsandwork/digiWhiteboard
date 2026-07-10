import { NextResponse } from "next/server";
import { emptyStaffBoardOverlays, loadStaffBoardOverlays } from "@/lib/staff/board-overlays";
import { debugBoardLog } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debugBoard = url.searchParams.get("debugBoard") === "1";
  const department = url.searchParams.get("department")?.trim() || "staff_whiteboard";
  const startedAt = Date.now();

  try {
    const overlays = await loadStaffBoardOverlays(getServiceSupabase(), { department });
    debugBoardLog(debugBoard, "board overlays ok", {
      department,
      durationMs: Date.now() - startedAt,
      healthy: overlays.healthy
    });
    return NextResponse.json(overlays, {
      headers: {
        "cache-control": "private, max-age=2, stale-while-revalidate=8"
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
