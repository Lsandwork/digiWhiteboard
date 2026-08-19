import { after, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getTlDigiBoardSnapshot, loadTlDigiBoardPublicPayload } from "@/lib/tl-digi-board/server";
import { buildUnavailableTlBoardSnapshot } from "@/lib/tl-digi-board/board-state";
import { logTlGingrSyncEvent } from "@/lib/tl-digi-board/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public READ for the Team Lead Alerts + Reminders TV display.
 * No admin session required (same pattern as live-board / cast-tv).
 * Never exposes GINGR_API_KEY or other secrets.
 *
 * This GET must not wait on Gingr. Production hung here because the TV poll
 * awaited a full medication sync with no HTTP timeouts. Serve the stored
 * snapshot immediately; refresh Gingr in `after()` (and the 1-minute cron).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("force") === "1";
    const supabase = getServiceSupabase();
    const { payload, needsBackgroundSync } = await loadTlDigiBoardPublicPayload(supabase, { forceRefresh });

    if (needsBackgroundSync) {
      after(() => {
        void getTlDigiBoardSnapshot(supabase, { forceRefresh: true }).catch((error) => {
          const message = error instanceof Error ? error.message : "TL Digi Board background sync failed.";
          logTlGingrSyncEvent("GINGR_SYNC_FAILURE", { error: message, source: "public_api_after" });
        });
      });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TL Digi Board snapshot.";
    logTlGingrSyncEvent("GINGR_SYNC_FAILURE", { error: message, source: "public_api" });
    const unavailable = buildUnavailableTlBoardSnapshot(new Date(), message);
    return NextResponse.json(
      {
        ...unavailable,
        config: { displayTitle: "Team Lead Alerts + Reminders", enabled: true },
        reminders: [],
        error: message
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
