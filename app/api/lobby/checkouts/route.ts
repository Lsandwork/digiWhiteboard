import { NextResponse } from "next/server";
import { cachedLoadLobbySettings, FAST_CHECKOUT_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyCheckoutDogs, loadLobbyCheckoutDogsFast } from "@/lib/lobby/checkout";
import { sanitizeLobbyCheckouts } from "@/lib/lobby/validate";
import { debugBoardLog, getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadLobbyBoard(request)) {
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
  const cacheKey = fast ? "lobby-checkouts:fast" : "lobby-checkouts:full";
  const lastGoodKey = `${cacheKey}:last-good`;

  try {
    const supabase = getServiceSupabase();
    const checkout = await getOrLoadTtlCache(cacheKey, FAST_CHECKOUT_CACHE_TTL_MS, async () => {
      if (fast) return loadLobbyCheckoutDogsFast(supabase, now);
      const settings = await cachedLoadLobbySettings(supabase);
      return loadLobbyCheckoutDogs(supabase, settings.max_queue_count, now);
    });

    const payload = sanitizeLobbyCheckouts({
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

    setTtlCache(lastGoodKey, payload, 120_000);
    debugBoardLog(debugBoard, "lobby checkouts ok", {
      fast,
      durationMs: Date.now() - startedAt,
      active: checkout.activeCount
    });

    return NextResponse.json(payload, {
      headers: { "cache-control": "private, max-age=1, stale-while-revalidate=4" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby checkouts.";
    const lastGood = getTtlCache<Record<string, unknown>>(lastGoodKey);
    debugBoardLog(debugBoard, "lobby checkouts failed", {
      error: message,
      hasLastGood: Boolean(lastGood),
      durationMs: Date.now() - startedAt
    });
    if (lastGood) {
      return NextResponse.json(
        sanitizeLobbyCheckouts({ ...lastGood, stale: true, error: message }),
        { status: 200, headers: { "cache-control": "private, max-age=1" } }
      );
    }
    return NextResponse.json(
      sanitizeLobbyCheckouts({
        featured: null,
        queue: [],
        counts: { active: 0, queue: 0 },
        last_updated: now.toISOString(),
        basket_filtered: false,
        stale: true,
        error: message
      }),
      { status: 200, headers: { "cache-control": "private, max-age=1" } }
    );
  }
}
