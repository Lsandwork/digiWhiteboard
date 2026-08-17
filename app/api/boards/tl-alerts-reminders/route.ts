import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadTlDigiBoardPublicPayload } from "@/lib/tl-digi-board/server";

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
