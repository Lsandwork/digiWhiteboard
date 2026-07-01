import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { getBoardEnvCheck, getMissingBoardEnvVars, getRecommendedBoardEnvVars } from "@/lib/env";
import { syncGingrBoardState } from "@/lib/gingr-board-sync";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";

  console.log("[Fitdog Board API] request received", { debugBoard });

  const envCheck = getBoardEnvCheck();
  console.log("[Fitdog Board API] env check", envCheck);

  const missingEnv = getMissingBoardEnvVars();
  const recommendedEnv = getRecommendedBoardEnvVars();

  if (missingEnv.length) {
    console.error("[Fitdog Board API] missing env vars:", missingEnv.join(", "));
    return NextResponse.json(
      {
        error: `Board configuration incomplete. Missing: ${missingEnv.join(", ")}`,
        checking_in: [],
        checking_out: [],
        counts: { checking_in: 0, checking_out: 0, total: 0 },
        last_updated: new Date().toISOString(),
        ...(debugBoard ? { debug: { env: envCheck, missing_env: missingEnv } } : {})
      },
      { status: 503 }
    );
  }

  try {
    const supabase = getServiceSupabase();
    const now = new Date();

    const syncSummary = await syncGingrBoardState(supabase);
    console.log("[Fitdog Board API] gingr sync:", syncSummary);

    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("status_started_at", { ascending: true });

    if (error) throw error;

    const rawRecordCount = data?.length ?? 0;
    console.log("[Fitdog Board API] records returned:", rawRecordCount);

    const dogs = (data ?? []) as LiveDog[];
    const enrichedDogs = dogs.map((dog) => ({
      ...dog,
      photo_url: resolveDogPhotoUrl(dog)
    }));

    const checkingIn = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_in" && !shouldExpireCheckinDog(dog, now)
    );
    const checkingOut = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
    );

    const expiredCheckin = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_in" && shouldExpireCheckinDog(dog, now)
    );
    const expiredCheckout = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_out" && shouldExpireCheckoutDog(dog, now)
    );

    if (expiredCheckin.length || expiredCheckout.length) {
      const hideIds = [...expiredCheckin, ...expiredCheckout].map((dog) => dog.id);
      await supabase
        .from("live_transition_dogs")
        .update({
          hidden: true,
          display_status: "removed",
          completed_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .in("id", hideIds);
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
              raw_record_count: rawRecordCount,
              checking_in_count: checkingIn.length,
              checking_out_count: checkingOut.length,
              expired_checkin_count: expiredCheckin.length,
              expired_checkout_count: expiredCheckout.length,
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
        last_updated: new Date().toISOString(),
        ...(debugBoard ? { debug: { env: envCheck, recommended_env: recommendedEnv } } : {})
      },
      { status: 500 }
    );
  }
}
