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
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const now = new Date();

    const { data: visibleDogs, error: visibleError } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"]);

    if (visibleError) throw visibleError;

    const refreshDisplayUntil = async (dogs: typeof visibleDogs) => {
      for (const dog of dogs ?? []) {
        const liveDog = dog as LiveDog;
        const anchor = liveDog.status_started_at;
        if (!anchor) continue;

        const resolvedUntil =
          liveDog.display_status === "checking_out"
            ? getCheckoutDisplayUntilAt(liveDog, undefined, now)
            : getCheckinDisplayUntilAt(liveDog, undefined, now);
        if (!resolvedUntil || resolvedUntil <= now) continue;

        const storedUntil = liveDog.display_until ? new Date(liveDog.display_until) : null;
        if (storedUntil && storedUntil > now) continue;

        const displayUntil =
          liveDog.display_status === "checking_out"
            ? computeCheckoutDisplayUntilIso(anchor)
            : computeCheckinDisplayUntilIso(anchor);

        const { error } = await supabase
          .from("live_transition_dogs")
          .update({ display_until: displayUntil, updated_at: now.toISOString() })
          .eq("id", liveDog.id);
        if (error) throw error;
      }
    };

    await refreshDisplayUntil(visibleDogs);

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

    const response: LiveBoardResponse = {
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: checkingIn.length + checkingOut.length
      },
      last_updated: now.toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load live board." },
      { status: 500 }
    );
  }
}
