import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

const minimumVisibleMs = 3 * 60 * 1000;

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const expiredBefore = new Date(Date.now() - minimumVisibleMs).toISOString();

    const { error: cleanupError } = await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        updated_at: new Date().toISOString()
      })
      .eq("hidden", false)
      .not("completed_at", "is", null)
      .lte("status_started_at", expiredBefore);

    if (cleanupError) throw cleanupError;

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
    const checkingOut = enrichedDogs.filter((dog) => dog.display_status === "checking_out");

    const response: LiveBoardResponse = {
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: dogs.length
      },
      last_updated: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load live board." },
      { status: 500 }
    );
  }
}
