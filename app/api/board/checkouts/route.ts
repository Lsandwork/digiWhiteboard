import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  FAST_CHECKOUT_QUERY_TIMEOUT_MS,
  loadFastBoardTransitions,
  reconcileCachedBasketClears,
  refreshRetiredTransitionKeys,
  sweepExpiredTransitionRows
} from "@/lib/board-fast-checkout";
import { fastCheckoutCacheTtlMs, getOrLoadFastCheckoutCache, invalidateBoardTransitionCaches } from "@/lib/board-settings-cache";
import { fillAndPersistMissingAnimalPhotos, collectMissingPhotoAnimalIds } from "@/lib/board-animal-photos";
import { refreshGingrBoardCache } from "@/lib/gingr-board-refresh";
import { debugBoardLog, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { shellyCheckoutAlertKey, triggerShellyAlert } from "@/lib/shelly-alert";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LAST_GOOD_KEY = "board-checkouts:last-good";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const debugBoard = searchParams.get("debugBoard") === "1";
  const fresh = searchParams.get("fresh") === "1";
  const startedAt = Date.now();
  const now = new Date();

  try {
    const loadCheckouts = () =>
      loadFastBoardTransitions(getServiceSupabase({ timeoutMs: FAST_CHECKOUT_QUERY_TIMEOUT_MS }), now);
    const result = fresh
      ? await loadCheckouts()
      : await getOrLoadFastCheckoutCache("board-checkouts:fast", loadCheckouts);
    const durationMs = Date.now() - startedAt;
    const payload = {
      checking_in: result.checking_in,
      checking_out: result.checking_out,
      counts: {
        checking_in: result.checking_in.length,
        checking_out: result.checking_out.length,
        total: result.checking_in.length + result.checking_out.length
      },
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
              visible_checking_in_count: result.checking_in.length,
              visible_checking_out_count: result.checking_out.length
            }
          }
        : {})
    };

    if (fresh) {
      setTtlCache(
        "board-checkouts:fast",
        result,
        fastCheckoutCacheTtlMs(result.checking_in.length, result.checking_out.length)
      );
    }
    if (result.checking_in.length || result.checking_out.length) {
      setTtlCache(LAST_GOOD_KEY, payload, 120_000);
    }

    after(async () => {
      const supabase = getServiceSupabase({ timeoutMs: FAST_CHECKOUT_QUERY_TIMEOUT_MS });
      // Always refresh Gingr here — even when the Supabase query timed out —
      // so the next 500ms empty-board poll can paint a just-added basket dog.
      const [, , cleared, swept] = await Promise.all([
        refreshGingrBoardCache().catch(() => null),
        refreshRetiredTransitionKeys(supabase, now).catch(() => null),
        reconcileCachedBasketClears(supabase, now).catch(() => ({ hidden_count: 0 })),
        sweepExpiredTransitionRows(supabase, now).catch(() => ({ hidden_count: 0 })),
        fillAndPersistMissingAnimalPhotos(
          supabase,
          collectMissingPhotoAnimalIds([...result.checking_in, ...result.checking_out])
        ).catch(() => 0)
      ]);
      if (cleared.hidden_count > 0 || swept.hidden_count > 0) {
        invalidateBoardTransitionCaches();
      }
    });

    if (result.checking_out.length) {
      after(async () => {
        await Promise.all(
          result.checking_out.map((dog) =>
            triggerShellyAlert("dog_check_out", shellyCheckoutAlertKey(dog))
          )
        );
      });
    }

    debugBoardLog(debugBoard, "fast transitions ok", {
      durationMs,
      checkingIn: result.checking_in.length,
      checkingOut: result.checking_out.length
    });
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    after(async () => {
      await refreshGingrBoardCache().catch(() => null);
    });
    const message = error instanceof Error ? error.message : "Unable to load fast checkout board.";
    const lastGood = getTtlCache<Record<string, unknown>>(LAST_GOOD_KEY);
    debugBoardLog(debugBoard, "fast checkouts failed", { error: message, hasLastGood: Boolean(lastGood) });
    if (lastGood) {
      return NextResponse.json(
        { ...lastGood, stale: true, error: message },
        { status: 200, headers: { "cache-control": "private, max-age=1" } }
      );
    }
    // Return 200 empty so clients keep last-good UI instead of error-flashing.
    return NextResponse.json(
      {
        checking_in: [],
        checking_out: [],
        counts: { checking_in: 0, checking_out: 0, total: 0 },
        last_updated: now.toISOString(),
        basket_filtered: false,
        stale: true,
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
      { status: 200, headers: { "cache-control": "private, max-age=1" } }
    );
  }
}
