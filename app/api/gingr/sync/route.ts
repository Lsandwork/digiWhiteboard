import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.GINGR_SYNC_SECRET || request.headers.get("x-sync-secret") !== process.env.GINGR_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const summary = {
    active_checking_in: 0,
    active_checking_out: 0,
    hidden_completed: 0,
    errors: [] as string[]
  };

  try {
    const { data: activeDogs, error } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"]);
    if (error) throw error;

    const subdomain = process.env.GINGR_SUBDOMAIN ?? "fitdog";
    const apiKey = process.env.GINGR_API_KEY;

    if (!apiKey) {
      summary.active_checking_in = activeDogs?.filter((dog) => dog.display_status === "checking_in").length ?? 0;
      summary.active_checking_out = activeDogs?.filter((dog) => dog.display_status === "checking_out").length ?? 0;
      summary.errors.push("GINGR_API_KEY is not configured; sync reported current board state only.");
      return NextResponse.json(summary);
    }

    for (const dog of activeDogs ?? []) {
      if (!dog.gingr_reservation_id) continue;

      const url = `https://${subdomain}.gingrapp.com/api/v1/reservations/${encodeURIComponent(dog.gingr_reservation_id)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        summary.errors.push(`Reservation ${dog.gingr_reservation_id}: Gingr returned ${response.status}.`);
        continue;
      }

      const reservation = (await response.json()) as Record<string, unknown>;
      const status = String(reservation.status ?? reservation.current_status ?? "").toLowerCase();
      const stillTransitioning = status === "checking_in" || status === "checking_out";

      if (!stillTransitioning) {
        const now = new Date().toISOString();
        const { error: hideError } = await supabase
          .from("live_transition_dogs")
          .update({
            hidden: true,
            display_status: "removed",
            current_status: status || "synced_removed",
            completed_at: now,
            last_seen_from_gingr_at: now,
            updated_at: now
          })
          .eq("id", dog.id);

        if (hideError) summary.errors.push(hideError.message);
        else summary.hidden_completed += 1;
      } else if (status === "checking_in") {
        summary.active_checking_in += 1;
      } else {
        summary.active_checking_out += 1;
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : "Sync failed.");
    return NextResponse.json(summary, { status: 500 });
  }
}
