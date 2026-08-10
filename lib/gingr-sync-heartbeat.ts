import { getServiceSupabase } from "@/lib/supabase/server";

const HEARTBEAT_MIN_INTERVAL_MS = 5 * 60_000;

let lastHeartbeatAt = 0;

type BackOfHouseLike = {
  source: string;
  checking_in: Array<{ animal_id?: string | number | null; id?: string | number | null }>;
  checking_out: Array<{ animal_id?: string | number | null; id?: string | number | null }>;
};

/**
 * Keep Ops / System Health Gingr status live when the board is reading Gingr via
 * back-of-house API even if webhook audit rows lag or Gingr only pushes sporadically.
 */
export async function recordGingrBackOfHouseHeartbeat(board: BackOfHouseLike, nowMs = Date.now()) {
  if (board.source !== "gingr_back_of_house") return { recorded: false as const, reason: "source" as const };
  if (nowMs - lastHeartbeatAt < HEARTBEAT_MIN_INTERVAL_MS) {
    return { recorded: false as const, reason: "throttled" as const };
  }
  lastHeartbeatAt = nowMs;

  try {
    const supabase = getServiceSupabase();
    const nowIso = new Date(nowMs).toISOString();
    const { error } = await supabase.from("gingr_webhook_events").insert({
      webhook_type: "back_of_house_sync",
      entity_id: null,
      entity_type: "back_of_house",
      signature: null,
      verified: true,
      processed: true,
      processing_error: null,
      payload: {
        source: "gingr_back_of_house",
        checking_in: board.checking_in.length,
        checking_out: board.checking_out.length,
        recorded_at: nowIso
      }
    });
    if (error) {
      console.error("gingr back-of-house heartbeat failed", error.message);
      return { recorded: false as const, reason: "insert_error" as const };
    }

    const animalIds = [
      ...board.checking_in.map((row) => (row.animal_id != null ? String(row.animal_id) : null)),
      ...board.checking_out.map((row) => (row.animal_id != null ? String(row.animal_id) : null))
    ].filter((id): id is string => Boolean(id));

    if (animalIds.length) {
      const unique = [...new Set(animalIds)].slice(0, 80);
      await supabase
        .from("live_transition_dogs")
        .update({ last_seen_from_gingr_at: nowIso, updated_at: nowIso })
        .eq("hidden", false)
        .in("display_status", ["checking_in", "checking_out"])
        .in("gingr_animal_id", unique);
    }

    return { recorded: true as const, reason: null };
  } catch (error) {
    console.error(
      "gingr back-of-house heartbeat failed",
      error instanceof Error ? error.message : error
    );
    return { recorded: false as const, reason: "exception" as const };
  }
}
