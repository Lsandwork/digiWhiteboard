import { after } from "next/server";
import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { getBoardEnvCheck, getMissingBoardEnvVars, getRecommendedBoardEnvVars } from "@/lib/env";
import {
  fetchGingrBackOfHouse,
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
    (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
  );
  return { checkingIn, checkingOut };
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

    if (gingrBoard.source !== "disabled") {
      const liveDogs = enrichDogs(mapGingrBoardToLiveDogs(gingrBoard));
      rawRecordCount = liveDogs.length;
      const visible = filterVisibleDogs(liveDogs, now);
      checkingIn = visible.checkingIn;
      checkingOut = visible.checkingOut;
      syncSummary = {
        synced: true,
        source: gingrBoard.source,
        checking_in: gingrBoard.checking_in.length,
        checking_out: gingrBoard.checking_out.length
      };

      after(async () => {
        try {
          const supabase = getServiceSupabase();
          await syncGingrBoardState(supabase);
        } catch (error) {
          console.error("[Fitdog Board API] background sync failed:", error);
        }
      });
    } else {
      const supabase = getServiceSupabase();
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
      checkingOut = visible.checkingOut;
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
