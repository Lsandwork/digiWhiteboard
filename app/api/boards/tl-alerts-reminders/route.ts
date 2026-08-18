import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadTlDigiBoardPublicPayload } from "@/lib/tl-digi-board/server";
import { logTlGingrSyncEvent } from "@/lib/tl-digi-board/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public READ for the Team Lead Alerts + Reminders TV display.
 * No admin session required (same pattern as live-board / cast-tv).
 * Never exposes GINGR_API_KEY or other secrets.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("force") === "1";
    const supabase = getServiceSupabase();
    const payload = await loadTlDigiBoardPublicPayload(supabase, { forceRefresh });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TL Digi Board snapshot.";
    logTlGingrSyncEvent("GINGR_SYNC_FAILURE", { error: message, source: "public_api" });
    return NextResponse.json(
      {
        overdue: [],
        current: [],
        summary: { due: 0, completed: 0, remaining: 0, overdue: 0 },
        additionalServices: [],
        servicesSummary: { due: 0, completed: 0, remaining: 0, knownIncomplete: 0, completionUnknown: 0 },
        meta: {
          timezone: "America/Los_Angeles",
          currentPeriod: null,
          gingrSyncHealth: "connection_issue",
          lastSuccessfulSyncAt: null,
          lastAttemptAt: new Date().toISOString(),
          lastError: message,
          isStale: true,
          allClear: false,
          medicationsHealth: "error",
          servicesHealth: "error",
          medicationsAllClear: false,
          servicesAllClear: false,
          boardState: "CONNECTION_ERROR",
          nextPeriod: null,
          nextPeriodStartsAt: null,
          administrationStatusAvailable: false,
          servicesCompletionStatusAvailable: false,
          servicesCompletionAudit: null
        },
        medications: [],
        generatedAt: new Date().toISOString(),
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
