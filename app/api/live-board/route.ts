import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import {
  computeCheckinDisplayUntilIso,
  getCheckinDisplayUntilAt,
  shouldExpireCheckinDog
} from "@/lib/checkin-display";
import {
  computeCheckoutDisplayUntilIso,
  getCheckoutDisplayUntilAt,
  shouldExpireCheckoutDog
} from "@/lib/checkout-display";
import { getBoardEnvCheck, getMissingBoardEnvVars } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

function isRecentlySeen(dog: LiveDog, now: Date) {
  if (!dog.last_seen_from_gingr_at) return false;
  return now.getTime() - new Date(dog.last_seen_from_gingr_at).getTime() <= 5 * 60 * 1000;
}

function refreshDisplayUntilForDog(dog: LiveDog, now: Date) {
  const anchor = dog.status_started_at ?? dog.last_seen_from_gingr_at ?? dog.updated_at;
  if (!anchor) return null;

  const resolvedUntil =
    dog.display_status === "checking_out"
      ? getCheckoutDisplayUntilAt(dog, undefined, now)
      : getCheckinDisplayUntilAt(dog, undefined, now);

  if (resolvedUntil && resolvedUntil > now) {
    const storedUntil = dog.display_until ? new Date(dog.display_until) : null;
    if (storedUntil && storedUntil > now) return null;
    return dog.display_status === "checking_out"
      ? computeCheckoutDisplayUntilIso(anchor)
      : computeCheckinDisplayUntilIso(anchor);
  }

  if (!isRecentlySeen(dog, now)) return null;

  return dog.display_status === "checking_out"
    ? computeCheckoutDisplayUntilIso(now.toISOString())
    : computeCheckinDisplayUntilIso(now.toISOString());
}

export async function GET(request: Request) {
  const debugBoard = new URL(request.url).searchParams.get("debugBoard") === "1";

  console.log("[Fitdog Board API] request received", { debugBoard });

  const envCheck = getBoardEnvCheck();
  console.log("[Fitdog Board API] env check", envCheck);

  const missingEnv = getMissingBoardEnvVars();
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

    const { data: visibleDogs, error: visibleError } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"]);

    if (visibleError) throw visibleError;

    const rawRecordCount = visibleDogs?.length ?? 0;
    console.log("[Fitdog Board API] records returned:", rawRecordCount);

    for (const dog of visibleDogs ?? []) {
      const liveDog = dog as LiveDog;
      const displayUntil = refreshDisplayUntilForDog(liveDog, now);
      if (!displayUntil) continue;

      const { error } = await supabase
        .from("live_transition_dogs")
        .update({ display_until: displayUntil, updated_at: now.toISOString() })
        .eq("id", liveDog.id);
      if (error) throw error;
    }

    const checkinExpired = (visibleDogs ?? []).filter(
      (dog) => dog.display_status === "checking_in" && shouldExpireCheckinDog(dog as LiveDog, now)
    );

    const checkoutExpired = (visibleDogs ?? []).filter(
      (dog) => dog.display_status === "checking_out" && shouldExpireCheckoutDog(dog as LiveDog, now)
    );

    const hideGroup = async (dogs: typeof visibleDogs, currentStatus: string) => {
      if (!dogs?.length) return;
      const hideIds = dogs.map((dog) => dog.id);
      const { error } = await supabase
        .from("live_transition_dogs")
        .update({
          hidden: true,
          display_status: "removed",
          current_status: currentStatus,
          completed_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .in("id", hideIds);
      if (error) throw error;
    };

    await hideGroup(checkinExpired, "checkin_expired");
    await hideGroup(checkoutExpired, "checkout_expired");

    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("status_started_at", { ascending: true });

    if (error) throw error;

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
              expired_checkin_count: checkinExpired.length,
              expired_checkout_count: checkoutExpired.length,
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
        ...(debugBoard ? { debug: { env: envCheck } } : {})
      },
      { status: 500 }
    );
  }
}
