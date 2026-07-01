import { after } from "next/server";
import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
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
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: resolveDogPhotoUrl(dog)
  }));
}

function filterVisibleDogs(dogs: LiveDog[], now: Date) {
  const checkingIn = dogs.filter(
    (dog) => dog.display_status === "checking_in" && !shouldExpireCheckinDog(dog, now)
  );
  const checkingOut = dogs.filter(
    (dog) =>
      dog.display_status === "checking_out" &&
      isPromptedCheckoutDog(dog) &&
      !shouldExpireCheckoutDog(dog, now)
  );
  return { checkingIn, checkingOut };
}

function mergeCheckoutDogs(primary: LiveDog[], secondary: LiveDog[]) {
  const dogsByKey = new Map<string, LiveDog>();

  for (const dog of [...primary, ...secondary]) {
    const key = dog.gingr_reservation_id ?? dog.gingr_animal_id ?? dog.id;
    if (!dogsByKey.has(key)) dogsByKey.set(key, dog);
  }

  return [...dogsByKey.values()].sort(
    (a, b) => new Date(a.status_started_at ?? a.updated_at).getTime() - new Date(b.status_started_at ?? b.updated_at).getTime()
  );
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

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";
  const now = new Date();

  console.log("[Fitdog Board API] request received", { debugBoard, mode: "gingr_live" });

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
    const gingrBoard = await fetchGingrBackOfHouse();
    let checkingIn: LiveDog[] = [];
    let checkingOut: LiveDog[] = [];
    let rawRecordCount = 0;
    let syncSummary: Record<string, unknown> = { synced: false };
    let checkoutDebug: Record<string, unknown> = {};
    const supabase = getServiceSupabase();
    const promptedCheckoutRows = await loadPromptedCheckoutRows(supabase, now);

    if (gingrBoard.source !== "disabled") {
      const gingrPromptStats = getGingrCheckoutPromptStats(gingrBoard);
      const liveDogs = enrichDogs(mapGingrBoardToLiveDogs(gingrBoard));
      rawRecordCount = gingrBoard.checking_in.length + gingrBoard.checking_out.length;
      const visible = filterVisibleDogs(liveDogs, now);
      checkingIn = visible.checkingIn;
      checkingOut = mergeCheckoutDogs(visible.checkingOut, promptedCheckoutRows.visible);
      checkoutDebug = {
        ...gingrPromptStats,
        supabase_checkout_rows: promptedCheckoutRows.rawCheckoutRows,
        supabase_prompted_checkout_rows: promptedCheckoutRows.promptedCheckoutRows,
        supabase_filtered_unprompted_checkout_rows: promptedCheckoutRows.filteredUnpromptedRows,
        expired_checking_out_count: promptedCheckoutRows.expiredCheckoutRows,
        visible_checking_out_count: checkingOut.length
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
          await syncGingrBoardState(supabase);
        } catch (error) {
          console.error("[Fitdog Board API] background sync failed:", error);
        }
      });
    } else {
      syncSummary = await syncGingrBoardState(supabase);

      const { data, error } = await supabase
        .from("live_transition_dogs")
        .select("*")
        .eq("hidden", false)
        .in("display_status", ["checking_in", "checking_out"])
        .order("status_started_at", { ascending: true });

      if (error) throw error;

      rawRecordCount = data?.length ?? 0;
      const visible = filterVisibleDogs(enrichDogs((data ?? []) as LiveDog[]), now);
      checkingIn = visible.checkingIn;
      checkingOut = mergeCheckoutDogs(visible.checkingOut, promptedCheckoutRows.visible);
      checkoutDebug = {
        raw_checking_out_candidates: promptedCheckoutRows.rawCheckoutRows,
        prompted_checkout_count: promptedCheckoutRows.promptedCheckoutRows,
        scheduled_only_checkout_count: promptedCheckoutRows.filteredUnpromptedRows,
        filtered_unprompted_checkout_count: promptedCheckoutRows.filteredUnpromptedRows,
        expired_checking_out_count: promptedCheckoutRows.expiredCheckoutRows,
        visible_checking_out_count: checkingOut.length
      };
    }

    console.log("[Fitdog Board API] visible counts:", {
      checking_in: checkingIn.length,
      checking_out: checkingOut.length
    });

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
              raw_record_count: rawRecordCount,
              checking_in_count: checkingIn.length,
              checking_out_count: checkingOut.length,
              ...checkoutDebug,
              recommended_env: recommendedEnv,
              gingr_sync: syncSummary,
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
