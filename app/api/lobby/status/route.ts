import { NextResponse } from "next/server";
import { FAST_CHECKOUT_QUERY_TIMEOUT_MS } from "@/lib/board-fast-checkout";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyCheckoutDogsFast } from "@/lib/lobby/checkout";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadLobbyBoard(request)) return unauthorizedLobbyResponse();

  const now = new Date();

  try {
    const supabase = getServiceSupabase({ timeoutMs: FAST_CHECKOUT_QUERY_TIMEOUT_MS });
    const settings = await loadLobbySettings(supabase);
    const checkout = await loadLobbyCheckoutDogsFast(supabase, now);

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
