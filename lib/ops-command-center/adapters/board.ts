import { upsertOpsDog } from "@/lib/ops-command-center/dogs";
import { setOpsDogStatus } from "@/lib/ops-command-center/status";
import { recordOpsEvent } from "@/lib/ops-command-center/events";
import type { OpsDogStatusValue } from "@/lib/ops-command-center/types";

/**
 * Best-effort bridge from the live transition board into shared ops objects.
 * Must never throw into the Gingr webhook hot path.
 */
export async function syncBoardDogToOpsCommandCenter(input: {
  gingrAnimalId?: string | null;
  gingrReservationId?: string | null;
  animalName?: string | null;
  ownerName?: string | null;
  photoUrl?: string | null;
  room?: string | null;
  displayStatus?: string | null;
  currentStatus?: string | null;
  boardDogId?: string | null;
  occurredAt?: string | null;
}): Promise<void> {
  try {
    const dog = await upsertOpsDog({
      gingrAnimalId: input.gingrAnimalId,
      name: input.animalName,
      ownerName: input.ownerName,
      photoUrl: input.photoUrl,
      markGingrSynced: true
    });
    if (!dog) return;

    const status = mapBoardDisplayToOpsStatus(input.displayStatus, input.currentStatus, input.room);
    await setOpsDogStatus({
      dogId: dog.id,
      status,
      locationLabel: input.room || null,
      gingrReservationId: input.gingrReservationId || null,
      sourceModule: "gingr_board",
      emitEvent: false,
      metadata: {
        boardDogId: input.boardDogId || null,
        displayStatus: input.displayStatus || null,
        currentStatus: input.currentStatus || null
      }
    });

    const category =
      status === "checked_out" || input.displayStatus === "checking_out"
        ? "checkout"
        : status === "checked_in" || input.displayStatus === "checking_in"
          ? "check_in"
          : "status";

    await recordOpsEvent({
      dogId: dog.id,
      eventType: `board.${input.displayStatus || input.currentStatus || "update"}`,
      category,
      title: titleForBoardEvent(input.animalName, input.displayStatus, input.currentStatus, input.room),
      summary: input.room ? `Location: ${input.room}` : null,
      sourceModule: "gingr_board",
      sourceRecordType: "live_transition_dog",
      sourceRecordId: input.boardDogId || input.gingrReservationId || null,
      occurredAt: input.occurredAt || undefined,
      payload: {
        gingrAnimalId: input.gingrAnimalId || null,
        gingrReservationId: input.gingrReservationId || null,
        displayStatus: input.displayStatus || null,
        currentStatus: input.currentStatus || null,
        room: input.room || null
      }
    });
  } catch {
    // Never disrupt Gingr board ingestion.
  }
}

function mapBoardDisplayToOpsStatus(
  displayStatus?: string | null,
  currentStatus?: string | null,
  room?: string | null
): OpsDogStatusValue {
  const token = `${displayStatus || ""} ${currentStatus || ""}`.toLowerCase();
  if (token.includes("checking_out") || token.includes("checked_out")) return "checked_out";
  if (token.includes("ready") && token.includes("pickup")) return "ready_for_pickup";
  if (token.includes("checking_in")) return "arrived";
  if (token.includes("checked_in")) {
    const roomToken = (room || "").toLowerCase();
    if (roomToken.includes("groom")) return "grooming";
    if (roomToken.includes("train")) return "training";
    if (roomToken.includes("break")) return "break";
    if (roomToken.includes("yard") || roomToken.includes("play")) return "yard";
    return "checked_in";
  }
  return "other";
}

function titleForBoardEvent(
  animalName?: string | null,
  displayStatus?: string | null,
  currentStatus?: string | null,
  room?: string | null
) {
  const dog = animalName?.trim() || "Dog";
  if (displayStatus === "checking_in") return `${dog} — Arriving / checking in`;
  if (displayStatus === "checking_out") return `${dog} — Checking out`;
  if (currentStatus === "checked_in") return room ? `${dog} — Checked in · ${room}` : `${dog} — Checked in`;
  if (currentStatus === "checked_out") return `${dog} — Checked out`;
  return `${dog} — Board update`;
}
