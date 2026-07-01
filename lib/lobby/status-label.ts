import type { LiveDog } from "@/lib/types";
import { getCheckoutPromptTimestamp } from "@/lib/checkout-prompt";

type UnknownRecord = Record<string, unknown>;

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function extractLobbyBreed(dog: LiveDog) {
  const payload = (dog.raw_payload ?? {}) as UnknownRecord;
  const nestedAnimal =
    typeof payload.animal === "object" && payload.animal ? (payload.animal as UnknownRecord) : null;

  return (
    firstString(payload, ["breed", "breed_name", "animal_breed", "a_breed", "pet_breed", "dog_breed"]) ??
    firstString(nestedAnimal ?? {}, ["breed", "breed_name", "name"]) ??
    dog.reservation_type
  );
}

export function getLobbyCheckoutStatus(dog: LiveDog, featured = false) {
  const room = (dog.room ?? "").toLowerCase();
  const statusString = String((dog.flags?.status_string as string | undefined) ?? "").toLowerCase();

  if (room.includes("front desk") || statusString.includes("front desk")) {
    return featured ? "Now Ready for Pickup" : "Ready at Front Desk";
  }

  if (room.includes("groom") || room.includes("spa") || statusString.includes("groom")) {
    return "Finishing Groom";
  }

  if (featured) return "Now Ready for Pickup";
  return "On the Way Out";
}

export function getLobbyPromptedAt(dog: LiveDog) {
  const timestamp = getCheckoutPromptTimestamp((dog.raw_payload ?? {}) as UnknownRecord);
  return timestamp ? new Date(timestamp).toISOString() : dog.status_started_at;
}
