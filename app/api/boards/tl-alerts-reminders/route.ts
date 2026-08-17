import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { buildTlBoardMedicationRows, buildTlBoardSyncMeta } from "@/lib/tl-digi-board/board-state";
import { getTlDigiBoardSnapshot } from "@/lib/tl-digi-board/server";
import type { TlDigiBoardSnapshot } from "@/lib/tl-digi-board/types";

export const dynamic = "force-dynamic";

function emptySnapshot(): TlDigiBoardSnapshot {
  const built = buildTlBoardMedicationRows({
    medications: [],
    lastSuccessfulSyncAt: null,
    lastAttemptAt: null,
    lastError: null,
    syncSucceeded: false
  });
  const meta = buildTlBoardSyncMeta(
    {
      medications: [],
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      lastError: "TL Digi Board sync not configured yet.",
      syncSucceeded: false
    },
    built.summary
  );
  return {
    overdue: built.overdue,
    current: built.current,
    summary: built.summary,
    meta,
    medications: [],
    generatedAt: new Date().toISOString()
  };
}

/**
 * Public READ for the Team Lead Alerts + Reminders TV display.
 * No admin session required (same pattern as live-board / cast-tv).
 * Never exposes GINGR_API_KEY or other secrets.
 */
export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const snapshot = (await getTlDigiBoardSnapshot(supabase).catch(() => null)) ?? emptySnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TL Digi Board snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
