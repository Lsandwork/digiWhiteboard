import { NextResponse } from "next/server";
import { isLobbyAdmin, isLobbyDisplayAuthorized, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyCheckoutDogs, loadLobbyCheckoutDogsFast } from "@/lib/lobby/checkout";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLobbyDisplayAuthorized(request) && !isLobbyAdmin(request)) {
    return unauthorizedLobbyResponse({
      featured: null,
      queue: [],
      counts: { active: 0, queue: 0 },
      last_updated: new Date().toISOString(),
      error: "Unauthorized."
    });
  }

  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";
  const fast = new URL(request.url).searchParams.get("fast") === "1";
  const startedAt = Date.now();
  const now = new Date();

  try {
    const supabase = getServiceSupabase();
    const checkout = fast
      ? await loadLobbyCheckoutDogsFast(supabase, now)
      : await loadLobbyCheckoutDogs(supabase, (await loadLobbySettings(supabase)).max_queue_count, now);

    return NextResponse.json({
      featured: checkout.featured,
      queue: checkout.queue,
      counts: {
        active: checkout.activeCount,
        queue: checkout.queue.length
      },
      last_updated: now.toISOString(),
      basket_filtered: checkout.basket_filtered ?? false,
      ...(debugBoard
        ? {
            debug: {
              endpoint: "/api/lobby/checkouts",
              mode: fast ? "fast_internal" : "full_sync",
              data_source: checkout.data_source,
              request_duration_ms: Date.now() - startedAt,
              fetch_completed_at: new Date().toISOString(),
              used_cached_gingr: checkout.used_cached_gingr ?? false,
              newest_checkout_event_at: checkout.lastPromptedAt,
              active_checkout_count: checkout.activeCount
            }
          }
        : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby checkouts.";
    return NextResponse.json(
      {
        featured: null,
        queue: [],
        counts: { active: 0, queue: 0 },
        last_updated: now.toISOString(),
        error: message
      },
      { status: 500 }
    );
  }
}
