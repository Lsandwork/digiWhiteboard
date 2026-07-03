import { after } from "next/server";
import { NextResponse } from "next/server";
import { enrichStaffBoardAnimalPhotos } from "@/lib/board-animal-photos";
import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { buildGingrCheckoutKeySet, isDogInGingrCheckoutBasket, mergeCheckoutDogs, sortCheckoutDogs } from "@/lib/board-checkout-merge";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { getBoardEnvCheck, getMissingBoardEnvVars, getRecommendedBoardEnvVars } from "@/lib/env";
import {
  fetchGingrBackOfHouse,
  getGingrCheckoutPromptStats,
  mapGingrBoardToLiveDogs,
  syncGingrBoardState
} from "@/lib/gingr-board-sync";
import { canCallGingrEndpoint } from "@/lib/gingr-request-guard";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: resolveDogPhotoUrl(dog)
  }));
}
function filterVisibleDogs(
  dogs: LiveDog[],
  now: Date,
  options: { requireStoredLiveTrigger?: boolean; requirePromptedCheckout?: boolean } = {}
) {
  const { requireStoredLiveTrigger = false, requirePromptedCheckout = false } = options;
  const checkingIn = dogs.filter(
    (dog) =>
      dog.display_status === "checking_in" &&
      (!requireStoredLiveTrigger || isStoredLiveTriggeredDog(dog)) &&
      !shouldExpireCheckinDog(dog, now)
  );
  const checkingOut = dogs.filter(
    (dog) =>
      dog.display_status === "checking_out" &&
      (!requireStoredLiveTrigger || isStoredLiveTriggeredDog(dog)) &&
      (!requirePromptedCheckout || isPromptedCheckoutDog(dog)) &&
      !shouldExpireCheckoutDog(dog, now)
  );
  return { checkingIn, checkingOut };
}

function isStoredLiveTriggeredDog(dog: LiveDog) {
  return dog.raw_payload?.source !== "gingr_back_of_house";
}

function timeoutResult<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

async function loadPromptedCheckoutRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  now: Date
) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]);
  const prompted = rows.filter(isPromptedCheckoutDog);
  const expired = prompted.filter((dog) => shouldExpireCheckoutDog(dog, now));
  const visible = prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now));

  if (expired.length) {
    await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        completed_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .in(
        "id",
        expired.map((dog) => dog.id)
      );
  }

  return {
    visible,
    rawCheckoutRows: rows.length,
    promptedCheckoutRows: prompted.length,
    filteredUnpromptedRows: rows.length - prompted.length,
    expiredCheckoutRows: expired.length
  };
}

async function loadActiveCheckinRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  now: Date
) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_in")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]).filter(
    (dog) => dog.raw_payload?.source !== "gingr_back_of_house"
  );
  const expired = rows.filter((dog) => shouldExpireCheckinDog(dog, now));
  const visible = rows.filter((dog) => !shouldExpireCheckinDog(dog, now));

  if (expired.length) {
    await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        completed_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .in(
        "id",
        expired.map((dog) => dog.id)
      );
  }

  return {
    visible,
    expiredCheckinRows: expired.length,
    rawCheckinRows: rows.length
  };
}

async function loadSupabaseBoardRows(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .in("display_status", ["checking_in", "checking_out"])
    .order("status_started_at", { ascending: true });

  if (error) throw error;
  return enrichDogs((data ?? []) as LiveDog[]);
}

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";
  const now = new Date();

  const envCheck = getBoardEnvCheck();
  const missingEnv = getMissingBoardEnvVars();
  const recommendedEnv = getRecommendedBoardEnvVars();

  if (missingEnv.length) {
    return NextResponse.json(
      {
        error: `Board configuration incomplete. Missing: ${missingEnv.join(", ")}`,
        checking_in: [],
        checking_out: [],
        counts: { checking_in: 0, checking_out: 0, total: 0 },
        last_updated: now.toISOString(),
        ...(debugBoard ? { debug: { env: envCheck, missing_env: missingEnv, mode: "gingr_live" } } : {})
      },
      { status: 503 }
    );
  }

  try {
    const supabase = getServiceSupabase();
    const requestStartedAt = Date.now();
    const usedCachedGingr = !canCallGingrEndpoint("back_of_house");
    let gingrBoard: Awaited<ReturnType<typeof fetchGingrBackOfHouse>> | null = null;
    let gingrError: string | null = null;

    const [gingrBoardResult, activeCheckinRows, promptedCheckoutRows] = await Promise.all([
      fetchGingrBackOfHouse().catch((error) => {
        gingrError = error instanceof Error ? error.message : "Gingr fetch failed.";
        if (debugBoard) {
          console.error("[Fitdog Board API] Gingr fetch failed, using Supabase fallback:", gingrError);
        }
        return null;
      }),
      timeoutResult(loadActiveCheckinRows(supabase, now), 2500, {
        visible: [] as LiveDog[],
        expiredCheckinRows: 0,
        rawCheckinRows: 0
      }),
      timeoutResult(loadPromptedCheckoutRows(supabase, now), 2500, {
        visible: [] as LiveDog[],
        rawCheckoutRows: 0,
        promptedCheckoutRows: 0,
        filteredUnpromptedRows: 0,
        expiredCheckoutRows: 0
      })
    ]);

    gingrBoard = gingrBoardResult;

    let checkingIn: LiveDog[] = [];
    let checkingOut: LiveDog[] = sortCheckoutDogs(promptedCheckoutRows.visible);
    let rawRecordCount = 0;
    let syncSummary: Record<string, unknown> = { synced: false };
    let checkoutDebug: Record<string, unknown> = {};
    let checkinDebug: Record<string, unknown> = {};
    const newestCheckoutAt =
      promptedCheckoutRows.visible[promptedCheckoutRows.visible.length - 1]?.status_started_at ??
      promptedCheckoutRows.visible[promptedCheckoutRows.visible.length - 1]?.updated_at ??
      null;

    if (gingrBoard && gingrBoard.source !== "disabled") {
      const gingrPromptStats = getGingrCheckoutPromptStats(gingrBoard);
      const mappedLiveDogs = enrichDogs(mapGingrBoardToLiveDogs(gingrBoard));
      const liveDogs = await timeoutResult(applyStoredAnimalPhotos(supabase, mappedLiveDogs), 1500, mappedLiveDogs);
      rawRecordCount = gingrBoard.checking_in.length + gingrBoard.checking_out.length;
      const visible = filterVisibleDogs(liveDogs, now);
      const gingrCheckoutKeys = buildGingrCheckoutKeySet(visible.checkingOut);
      const basketMatchedPromptedCheckouts = promptedCheckoutRows.visible.filter((dog) =>
        isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)
      );
      checkingIn = visible.checkingIn;
      checkingOut = sortCheckoutDogs(
        mergeCheckoutDogs(visible.checkingOut, basketMatchedPromptedCheckouts)
      );
      checkinDebug = {
        raw_checking_in_candidates: gingrBoard.checking_in.length,
        webhook_checking_in_rows: activeCheckinRows.rawCheckinRows,
        expired_checking_in_count: activeCheckinRows.expiredCheckinRows,
        filtered_back_of_house_checking_in_count: Math.max(0, gingrBoard.checking_in.length - checkingIn.length)
      };
      checkoutDebug = {
        ...gingrPromptStats,
        supabase_checkout_rows: promptedCheckoutRows.rawCheckoutRows,
        supabase_prompted_checkout_rows: promptedCheckoutRows.promptedCheckoutRows,
        supabase_filtered_unprompted_checkout_rows: promptedCheckoutRows.filteredUnpromptedRows,
        expired_checking_out_count: promptedCheckoutRows.expiredCheckoutRows,
        visible_checking_out_count: checkingOut.length,
        supabase_prompted_checkout_rows_not_in_gingr_basket:
          promptedCheckoutRows.visible.length - basketMatchedPromptedCheckouts.length,
        ignored_unprompted_checkout_rows_while_gingr_live: promptedCheckoutRows.filteredUnpromptedRows
      };
      syncSummary = {
        synced: true,
        source: gingrBoard.source,
        checking_in: gingrBoard.checking_in.length,
        checking_out: gingrPromptStats.prompted_checkout_count,
        raw_checking_out_candidates: gingrPromptStats.raw_checking_out_candidates,
        filtered_unprompted_checkout_count: gingrPromptStats.filtered_unprompted_checkout_count
      };

      after(async () => {
        try {
          await syncGingrBoardState(supabase, gingrBoard);
        } catch (error) {
          if (debugBoard) {
            console.error("[Fitdog Board API] background sync failed:", error);
          }
        }
      });
    } else {
      if (gingrBoard?.source === "disabled") {
        syncSummary = await timeoutResult(syncGingrBoardState(supabase), 2500, {
          synced: false,
          reason: "sync timed out",
          checking_in: 0,
          checking_out: 0
        });
      } else {
        syncSummary = { synced: false, reason: gingrError ?? "Gingr unavailable", fallback: "supabase" };
      }

      const supabaseDogs = await loadSupabaseBoardRows(supabase);
      const storedSupabaseDogs = await timeoutResult(applyStoredAnimalPhotos(supabase, supabaseDogs), 1500, supabaseDogs);
      rawRecordCount = storedSupabaseDogs.length;
      const visible = filterVisibleDogs(storedSupabaseDogs, now, {
        requireStoredLiveTrigger: true,
        requirePromptedCheckout: true
      });
      const storedActiveCheckins = await timeoutResult(
        applyStoredAnimalPhotos(supabase, activeCheckinRows.visible),
        1500,
        activeCheckinRows.visible
      );
      const storedPromptedCheckouts = await timeoutResult(
        applyStoredAnimalPhotos(supabase, promptedCheckoutRows.visible),
        1500,
        promptedCheckoutRows.visible
      );
      checkingIn = storedActiveCheckins.length ? storedActiveCheckins : visible.checkingIn;
      checkingOut = sortCheckoutDogs(mergeCheckoutDogs(visible.checkingOut, storedPromptedCheckouts));
      checkinDebug = {
        webhook_checking_in_rows: activeCheckinRows.rawCheckinRows,
        expired_checking_in_count: activeCheckinRows.expiredCheckinRows
      };
      checkoutDebug = {
        raw_checking_out_candidates: promptedCheckoutRows.rawCheckoutRows,
        prompted_checkout_count: promptedCheckoutRows.promptedCheckoutRows,
        scheduled_only_checkout_count: promptedCheckoutRows.filteredUnpromptedRows,
        filtered_unprompted_checkout_count: promptedCheckoutRows.filteredUnpromptedRows,
        expired_checking_out_count: promptedCheckoutRows.expiredCheckoutRows,
        visible_checking_out_count: checkingOut.length
      };
    }

    const enrichedBoard = await timeoutResult(
      enrichStaffBoardAnimalPhotos(supabase, [...checkingIn, ...checkingOut]),
      4000,
      [...checkingIn, ...checkingOut]
    );
    const enrichedById = new Map(enrichedBoard.map((dog) => [dog.id, dog]));
    checkingIn = checkingIn.map((dog) => enrichedById.get(dog.id) ?? dog);
    checkingOut = checkingOut.map((dog) => enrichedById.get(dog.id) ?? dog);

    const response: LiveBoardResponse = {
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: checkingIn.length + checkingOut.length
      },
      last_updated: now.toISOString(),
      ...(debugBoard
        ? {
            debug: {
              endpoint: "/api/live-board",
              mode: "gingr_live",
              data_source: promptedCheckoutRows.visible.length
                ? "supabase_webhook_priority"
                : gingrBoard?.source === "gingr_back_of_house"
                  ? "gingr_back_of_house"
                  : "supabase_live_transition_dogs",
              request_duration_ms: Date.now() - requestStartedAt,
              fetch_completed_at: new Date().toISOString(),
              used_cached_gingr: usedCachedGingr,
              newest_checkout_event_at: newestCheckoutAt,
              raw_record_count: rawRecordCount,
              checking_in_count: checkingIn.length,
              checking_out_count: checkingOut.length,
              ...checkinDebug,
              ...checkoutDebug,
              recommended_env: recommendedEnv,
              gingr_sync: syncSummary,
              gingr_error: gingrError,
              env: envCheck
            }
          }
        : {})
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load live board.";
    console.error("[Fitdog Board API] error:", message);
    return NextResponse.json(
      {
        error: message,
        checking_in: [],
        checking_out: [],
        counts: { checking_in: 0, checking_out: 0, total: 0 },
        last_updated: now.toISOString(),
        ...(debugBoard ? { debug: { env: envCheck, recommended_env: recommendedEnv, mode: "gingr_live" } } : {})
      },
      { status: 500 }
    );
  }
}
