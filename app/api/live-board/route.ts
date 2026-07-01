import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { getBoardEnvCheck, getMissingBoardEnvVars, getRecommendedBoardEnvVars } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

function isWebhookSourcedDog(dog: LiveDog) {
  const payload = dog.raw_payload as { source?: string; webhook_type?: string } | null | undefined;
  if (payload?.source === "gingr_back_of_house") return false;
  return true;
}

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";
  const now = new Date();

  console.log("[Fitdog Board API] request received", { debugBoard, mode: "webhook_only" });

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
        ...(debugBoard ? { debug: { env: envCheck, missing_env: missingEnv, mode: "webhook_only" } } : {})
      },
      { status: 503 }
    );
  }

  try {
    const supabase = getServiceSupabase();

    await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        current_status: "synced_removed",
        updated_at: now.toISOString()
      })
      .eq("hidden", false)
      .filter("raw_payload->>source", "eq", "gingr_back_of_house");

    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("status_started_at", { ascending: true });

    if (error) throw error;

    const dogs = ((data ?? []) as LiveDog[]).filter(isWebhookSourcedDog);
    const rawRecordCount = dogs.length;

    const enrichedDogs = dogs.map((dog) => ({
      ...dog,
      photo_url: resolveDogPhotoUrl(dog)
    }));

    const expiredCheckin = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_in" && shouldExpireCheckinDog(dog, now)
    );
    const expiredCheckout = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_out" && shouldExpireCheckoutDog(dog, now)
    );

    const hideIds = [...expiredCheckin, ...expiredCheckout].map((dog) => dog.id);
    if (hideIds.length) {
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

    const checkingIn = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_in" && !shouldExpireCheckinDog(dog, now)
    );
    const checkingOut = enrichedDogs.filter(
      (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
    );

    console.log("[Fitdog Board API] webhook-only counts:", {
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
              mode: "webhook_only",
              raw_record_count: rawRecordCount,
              checking_in_count: checkingIn.length,
              checking_out_count: checkingOut.length,
              expired_checkin_count: expiredCheckin.length,
              expired_checkout_count: expiredCheckout.length,
              recommended_env: recommendedEnv,
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
        ...(debugBoard ? { debug: { env: envCheck, recommended_env: recommendedEnv, mode: "webhook_only" } } : {})
      },
      { status: 500 }
    );
  }
}
