import { getOpsDogById } from "@/lib/ops-command-center/dogs";
import { getOpsDogStatus } from "@/lib/ops-command-center/status";
import { listOpsEventsForDog } from "@/lib/ops-command-center/events";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { OpsDog, OpsDogStatus, OpsEvent } from "@/lib/ops-command-center/types";

export type OpsDogProfile = {
  dog: OpsDog;
  status: OpsDogStatus | null;
  timeline: OpsEvent[];
  board: {
    gingrReservationId: string | null;
    displayStatus: string | null;
    currentStatus: string | null;
    room: string | null;
    checkInAt: string | null;
    photoUrl: string | null;
  } | null;
  openIncidents: number;
  gingrLink: string | null;
};

export async function getOpsDogProfile(dogId: string): Promise<OpsDogProfile | null> {
  const dog = await getOpsDogById(dogId);
  if (!dog) return null;

  const [status, timeline, boardRow, incidents] = await Promise.all([
    getOpsDogStatus(dogId),
    listOpsEventsForDog(dogId, { limit: 80 }),
    dog.gingrAnimalId
      ? getServiceSupabase()
          .from("live_transition_dogs")
          .select(
            "gingr_reservation_id, display_status, current_status, room, status_started_at, animal_photo_url, created_at"
          )
          .eq("gingr_animal_id", dog.gingrAnimalId)
          .eq("hidden", false)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    dog.gingrAnimalId
      ? getServiceSupabase()
          .from("track_incidents")
          .select("id", { count: "exact", head: true })
          .eq("gingr_animal_id", dog.gingrAnimalId)
          .neq("status", "resolved")
      : Promise.resolve({ count: 0 })
  ]);

  const board = boardRow.data
    ? {
        gingrReservationId: boardRow.data.gingr_reservation_id
          ? String(boardRow.data.gingr_reservation_id)
          : null,
        displayStatus: boardRow.data.display_status ? String(boardRow.data.display_status) : null,
        currentStatus: boardRow.data.current_status ? String(boardRow.data.current_status) : null,
        room: boardRow.data.room ? String(boardRow.data.room) : null,
        checkInAt: boardRow.data.status_started_at
          ? String(boardRow.data.status_started_at)
          : boardRow.data.created_at
            ? String(boardRow.data.created_at)
            : null,
        photoUrl: boardRow.data.animal_photo_url ? String(boardRow.data.animal_photo_url) : null
      }
    : null;

  return {
    dog,
    status,
    timeline,
    board,
    openIncidents: incidents.count || 0,
    gingrLink: dog.gingrProfileUrl
  };
}
