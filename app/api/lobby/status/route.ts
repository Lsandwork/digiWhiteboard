import { NextResponse } from "next/server";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyCheckoutDogs } from "@/lib/lobby/checkout";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadLobbyBoard(request)) return unauthorizedLobbyResponse();

  const now = new Date();

  try {
    const supabase = getServiceSupabase();
    const settings = await loadLobbySettings(supabase);
    const checkout = await loadLobbyCheckoutDogs(supabase, settings.max_queue_count, now);

    return NextResponse.json({
      healthy: true,
      active_checkout_count: checkout.activeCount,
      last_successful_sync_at: checkout.lastPromptedAt,
      data_source: checkout.data_source,
      refresh_interval_ms: settings.refresh_interval_ms
    });
  } catch {
    return NextResponse.json({
      healthy: false,
      active_checkout_count: 0,
      last_successful_sync_at: null,
      data_source: "supabase_live_transition_dogs",
      refresh_interval_ms: 5000
    });
  }
}
