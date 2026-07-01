import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.GINGR_SYNC_SECRET || request.headers.get("x-sync-secret") !== process.env.GINGR_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const now = new Date().toISOString();

    const { data: removed, error } = await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        current_status: "synced_removed",
        updated_at: now
      })
      .eq("hidden", false)
      .filter("raw_payload->>source", "eq", "gingr_back_of_house")
      .select("id");

    if (error) throw error;

    const { count: checkingIn } = await supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .eq("display_status", "checking_in");

    const { count: checkingOut } = await supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .eq("display_status", "checking_out");

    return NextResponse.json({
      mode: "webhook_only",
      removed_reservation_sync_rows: removed?.length ?? 0,
      active_checking_in: checkingIn ?? 0,
      active_checking_out: checkingOut ?? 0
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    );
  }
}
