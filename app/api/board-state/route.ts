import { NextResponse } from "next/server";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyBoardState } from "@/lib/lobby/board-state";
import { debugBoardLog } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseBoard(value: string | null) {
  return value === "staff" ? "staff" : "lobby";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const board = parseBoard(url.searchParams.get("board"));
  const debugBoard = url.searchParams.get("debugBoard") === "1";
  const fast = url.searchParams.get("fast") === "1";
  const startedAt = Date.now();

  if (board === "staff") {
    return NextResponse.redirect(new URL(`/api/whiteboard/state?board=staff${debugBoard ? "&debugBoard=1" : ""}`, request.url));
  }

  if (!canReadLobbyBoard(request)) {
    return unauthorizedLobbyResponse({ error: "Unauthorized." });
  }

  try {
    const payload = await loadLobbyBoardState(getServiceSupabase(), { fast, debugBoard });
    debugBoardLog(debugBoard, "board-state lobby ok", {
      durationMs: Date.now() - startedAt,
      healthy: payload.healthy,
      stale: payload.checkouts.stale,
      active: payload.checkouts.counts.active
    });

    return NextResponse.json(payload, {
      headers: { "cache-control": "private, max-age=1, stale-while-revalidate=4" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby board state.";
    debugBoardLog(debugBoard, "board-state lobby failed", {
      durationMs: Date.now() - startedAt,
      error: message
    });

    return NextResponse.json(
      {
        board: "lobby",
        healthy: false,
        error: message,
        updatedAt: new Date().toISOString()
      },
      { status: 200, headers: { "cache-control": "private, max-age=1" } }
    );
  }
}
