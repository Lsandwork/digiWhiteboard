import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  isLiveTransitionQueryInCooldown,
  reconcileCachedBasketClears,
  sweepExpiredTransitionRows
} from "@/lib/board-fast-checkout";
import { refreshGingrBoardCache } from "@/lib/gingr-board-refresh";
import {
  cachedLoadLobbySettings,
  getOrLoadLobbyCheckoutCache,
  invalidateBoardTransitionCaches,
  lobbyCheckoutCacheTtlMs
} from "@/lib/board-settings-cache";
import { fillAndPersistMissingAnimalPhotos, collectMissingPhotoAnimalIds } from "@/lib/board-animal-photos";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import {
  LOBBY_FULL_CHECKOUT_TIMEOUT_MS,
  loadLobbyCheckoutDogs,
  loadLobbyCheckoutDogsFast
} from "@/lib/lobby/checkout";
import { FAST_CHECKOUT_QUERY_TIMEOUT_MS } from "@/lib/board-fast-checkout";
import { sanitizeLobbyCheckouts } from "@/lib/lobby/validate";
import { debugBoardLog, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
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

  const searchParams = new URL(request.url).searchParams;
  const debugBoard = searchParams.get("debugBoard") === "1";
  const fast = searchParams.get("fast") === "1";
  const fresh = searchParams.get("fresh") === "1";
  const startedAt = Date.now();
  const now = new Date();
  const cacheKey = fast ? "lobby-checkouts:fast" : "lobby-checkouts:full";
  const lastGoodKey = `${cacheKey}:last-good`;

  try {
    const supabase = getServiceSupabase({
      timeoutMs: fast ? FAST_CHECKOUT_QUERY_TIMEOUT_MS : LOBBY_FULL_CHECKOUT_TIMEOUT_MS
    });
    const loadCheckouts = async () => {
      if (fast) return loadLobbyCheckoutDogsFast(supabase, now);
      const settings = await cachedLoadLobbySettings(supabase);
      return loadLobbyCheckoutDogs(supabase, settings.max_queue_count, now);
    };
    const checkout = fresh
      ? await loadCheckouts()
      : await getOrLoadLobbyCheckoutCache(cacheKey, loadCheckouts);

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
              active_checkout_count: checkout.activeCount,
              supabase_timed_out: checkout.supabase_timed_out ?? false
            }
          }
        : {})
    });

    if (fresh) {
      setTtlCache(cacheKey, checkout, lobbyCheckoutCacheTtlMs(checkout.activeCount, checkout.queue.length));
    }
    const hasDogs = payload.counts.active > 0;
    // Never replace last-good dogs with an empty timeout payload. Idle empty is
    // stored only when Gingr confirmed the basket is clear.
    if (hasDogs || payload.basket_filtered) {
      setTtlCache(lastGoodKey, payload, 120_000);
    }

    if (fast) {
      after(async () => {
        // Always refresh the shared Gingr cache — lobby guests never wait on it.
        await refreshGingrBoardCache().catch(() => null);
        if (isLiveTransitionQueryInCooldown()) return;
        const [cleared, swept] = await Promise.all([
          reconcileCachedBasketClears(supabase, now).catch(() => ({ hidden_count: 0 })),
          sweepExpiredTransitionRows(supabase, now).catch(() => ({ hidden_count: 0 })),
          fillAndPersistMissingAnimalPhotos(
            supabase,
            collectMissingPhotoAnimalIds(
              [checkout.featured, ...checkout.queue].filter(Boolean) as Array<{
                gingr_animal_id?: string | null;
                dog_photo_url?: string | null;
              }>
            )
          ).catch(() => 0)
        ]);
        if (cleared.hidden_count > 0 || swept.hidden_count > 0) {
          invalidateBoardTransitionCaches();
        }
      });
    }

    debugBoardLog(debugBoard, "lobby checkouts ok", {
      fast,
      durationMs: Date.now() - startedAt,
      active: checkout.activeCount
    });

    if (!hasDogs && !payload.basket_filtered && checkout.supabase_timed_out) {
      const lastGood = getTtlCache<Record<string, unknown>>(lastGoodKey);
      if (lastGood) {
        return NextResponse.json(sanitizeLobbyCheckouts({ ...lastGood, stale: true }), {
          status: 200,
          headers: {
            "cache-control": fresh ? "private, no-store, max-age=0" : "private, max-age=1, stale-while-revalidate=4"
          }
        });
      }
    }

    return NextResponse.json(payload, {
      headers: {
        "cache-control": fresh ? "private, no-store, max-age=0" : "private, max-age=1, stale-while-revalidate=4"
      }
    });
  } catch (error) {
    after(async () => {
      await refreshGingrBoardCache().catch(() => null);
    });
    const message = error instanceof Error ? error.message : "Unable to load lobby checkouts.";
    const lastGood = getTtlCache<Record<string, unknown>>(lastGoodKey);
    debugBoardLog(debugBoard, "lobby checkouts failed", {
      error: message,
      hasLastGood: Boolean(lastGood),
      durationMs: Date.now() - startedAt
    });
    if (lastGood) {
      // Last-good payloads are still valid board data — do not attach `error` or
      // lobby clients treat the sync as failed and flash "Unable to verify lobby checkouts."
      return NextResponse.json(
        sanitizeLobbyCheckouts({ ...lastGood, stale: true }),
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
