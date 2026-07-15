import { NextResponse } from "next/server";
import { debugBoardLog, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CastBoardType } from "@/lib/whiteboard/cast-options";
import { loadWhiteboardState, persistWhiteboardState, type WhiteboardStateResponse } from "@/lib/whiteboard/state";

export const dynamic = "force-dynamic";

const API_TIMEOUT_MS = 8_000;

function parseBoard(value: string | null): CastBoardType | null {
  if (value === "staff" || value === "staff_whiteboard") return "staff";
  if (value === "lobby" || value === "lobby_whiteboard") return "lobby";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Whiteboard state request timed out.")), ms);
    })
  ]);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const board = parseBoard(url.searchParams.get("board"));
  const allowVideo = url.searchParams.get("noVideo") !== "1";
  const ifNoneMatch = request.headers.get("if-none-match")?.replace(/"/g, "").trim();

  if (!board) {
    return NextResponse.json({ error: "Missing or invalid board query. Use board=staff or board=lobby." }, { status: 400 });
  }

  const debugBoard = url.searchParams.get("debugBoard") === "1";
  const fresh = url.searchParams.get("fresh") === "1";
  const lastGoodKey = `whiteboard-state:last-good:${board}:video-${allowVideo ? "1" : "0"}`;
  const startedAt = Date.now();

  try {
    const supabase = getServiceSupabase();
    const state = await withTimeout(loadWhiteboardState(supabase, board, { allowVideo, fresh }), API_TIMEOUT_MS);
    setTtlCache(lastGoodKey, state, 120_000);

    void persistWhiteboardState(supabase, state).catch(() => {
      // Cache persistence is best-effort.
    });

    if (ifNoneMatch && ifNoneMatch === state.version) {
      debugBoardLog(debugBoard, "whiteboard state 304", { board, durationMs: Date.now() - startedAt });
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: `"${state.version}"`,
          "Cache-Control": "private, max-age=2, stale-while-revalidate=8"
        }
      });
    }

    debugBoardLog(debugBoard, "whiteboard state ok", {
      board,
      version: state.version,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(state, {
      headers: {
        ETag: `"${state.version}"`,
        "Cache-Control": "private, max-age=2, stale-while-revalidate=8"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load whiteboard state.";
    const lastGood = getTtlCache<WhiteboardStateResponse>(lastGoodKey);
    debugBoardLog(debugBoard, "whiteboard state failed", {
      board,
      error: message,
      hasLastGood: Boolean(lastGood),
      durationMs: Date.now() - startedAt
    });
    if (lastGood) {
      return NextResponse.json(
        { ...lastGood, stale: true, error: message },
        {
          status: 200,
          headers: {
            ETag: `"${lastGood.version}"`,
            "Cache-Control": "private, max-age=1"
          }
        }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
