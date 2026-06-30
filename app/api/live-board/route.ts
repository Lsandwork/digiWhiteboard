import { NextResponse } from "next/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { getServiceSupabase } from "@/lib/supabase/server";
import { shouldHideCompletedDog } from "@/lib/transition-cleanup";
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

    const completedToHide = (visibleDogs ?? []).filter(
      (dog) => dog.display_status === "checking_in" && shouldHideCompletedDog(dog as LiveDog, now)
    );

    const checkoutExpired = (visibleDogs ?? []).filter(
      (dog) => dog.display_status === "checking_out" && shouldExpireCheckoutDog(dog as LiveDog, now)
    );

    const dogsToHide = [...completedToHide, ...checkoutExpired];

    if (dogsToHide.length > 0) {
      const hideIds = dogsToHide.map((dog) => dog.id);
      const { error: cleanupError } = await supabase
        .from("live_transition_dogs")
        .update({
          hidden: true,
          display_status: "removed",
          current_status: "checkout_expired",
          completed_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .in("id", hideIds);

      if (cleanupError) throw cleanupError;
    }

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

    const checkingIn = enrichedDogs.filter((dog) => dog.display_status === "checking_in");
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
