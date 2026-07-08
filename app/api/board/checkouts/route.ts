import { NextResponse } from "next/server";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";
  const startedAt = Date.now();
  const now = new Date();

  try {
    const result = await loadFastPromptedCheckouts(getServiceSupabase(), now);
    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      checking_out: result.checking_out,
      counts: { checking_out: result.checking_out.length },
      last_updated: now.toISOString(),
      basket_filtered: result.basket_filtered,
      ...(debugBoard
        ? {
            debug: {
              endpoint: "/api/board/checkouts",
              mode: "fast_internal",
              data_source: result.data_source,
              request_duration_ms: durationMs,
              fetch_completed_at: new Date().toISOString(),
              used_cached_gingr: false,
              newest_checkout_event_at: result.newest_checkout_at,
              prompted_checkout_count: result.prompted_count,
              raw_checkout_rows: result.raw_checkout_rows,
              filtered_unprompted_checkout_rows: result.filtered_unprompted_rows,
              expired_checking_out_count: result.expired_checkout_rows,
              visible_checking_out_count: result.checking_out.length
            }
          }
        : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load fast checkout board.";
    return NextResponse.json(
      {
        checking_out: [],
        counts: { checking_out: 0 },
        last_updated: now.toISOString(),
        error: message,
        ...(debugBoard
          ? {
              debug: {
                endpoint: "/api/board/checkouts",
                mode: "fast_internal",
                request_duration_ms: Date.now() - startedAt,
                fetch_completed_at: new Date().toISOString()
              }
            }
          : {})
      },
      { status: 500 }
    );
  }
}
