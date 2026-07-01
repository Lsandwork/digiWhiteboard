import { extractPhotoUrl, normalizePhotoUrl } from "@/lib/board-utils";

type UnknownRecord = Record<string, unknown>;

export type BoardDirection = "checking_in" | "checking_out";

export type BoardDogSource = {
  record: UnknownRecord;
  direction?: BoardDirection | null;
  reservation_id?: string | number | null;
  animal_id?: string | number | null;
  event_timestamp?: string | number | null;
  updated_at?: string | number | null;
};

const checkingInAliases = new Set([
  "checking_in",
  "checking-in",
  "checking in",
  "check_in",
  "check-in",
  "check in",
  "arriving",
  "arrival",
  "inbound",
  "expected",
  "incoming",
  "checking in soon"
]);

const checkingOutAliases = new Set([
  "checking_out",
  "checking-out",
  "checking out",
  "check_out",
  "check-out",
  "check out",
  "leaving",
  "departure",
  "outgoing",
  "going_home",
  "going home",
  "pickup",
  "ready_for_pickup",
  "ready for pickup",
  "checking out soon"
]);

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

export function resolveBoardDirection(
  source: BoardDogSource,
  explicitType?: string | null
): BoardDirection | null {
  if (source.direction === "checking_in" || source.direction === "checking_out") {
    return source.direction;
  }

  const candidates = [
    explicitType,
    firstString(source.record, ["webhook_type", "status", "board_status", "direction", "event_type", "type", "action"]),
    firstString(source.record, ["status_string"])
  ]
    .map((value) => normalizeToken(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (checkingInAliases.has(candidate) || candidate.includes("checking in")) return "checking_in";
    if (checkingOutAliases.has(candidate) || candidate.includes("checking out")) return "checking_out";
  }

  return null;
}

function toIsoTimestamp(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(ms).toISOString();
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildAnimalName(record: UnknownRecord) {
  const nestedAnimal =
    typeof record.animal === "object" && record.animal ? (record.animal as UnknownRecord) : null;
  const nestedPet = typeof record.pet === "object" && record.pet ? (record.pet as UnknownRecord) : null;

  const direct =
    firstString(record, ["animal_name", "pet_name", "dog_name", "name", "a_first"]) ??
    firstString(nestedAnimal ?? {}, ["name", "animal_name", "pet_name", "a_first"]) ??
    firstString(nestedPet ?? {}, ["name", "pet_name"]);

  const last =
    firstString(record, ["a_last", "animal_last_name"]) ??
    firstString(nestedAnimal ?? {}, ["last_name", "a_last"]);

  const full = [direct, last].filter(Boolean).join(" ").trim();
  return full || "Unknown Dog";
}

function buildOwnerName(record: UnknownRecord) {
  const nestedOwner =
    typeof record.owner === "object" && record.owner ? (record.owner as UnknownRecord) : null;

  return (
    firstString(record, ["owner_name", "owner", "customer_name", "pickup_person", "parent_name", "client_name", "o_last", "o_first"]) ??
    firstString(nestedOwner ?? {}, ["name", "full_name", "last_name", "first_name"])
  );
}

function buildRoom(record: UnknownRecord) {
  return (
    firstString(record, ["room", "area", "location", "run_name", "area_name", "belonging_area", "status_string"]) ??
    null
  );
}

export function normalizeBoardDog(source: BoardDogSource) {
  const record = source.record;
  const nestedReservation =
    typeof record.reservation === "object" && record.reservation
      ? (record.reservation as UnknownRecord)
      : null;
  const nestedAnimal =
    typeof record.animal === "object" && record.animal ? (record.animal as UnknownRecord) : null;

  const merged = { ...nestedReservation, ...record, ...nestedAnimal };
  const direction = resolveBoardDirection(source, firstString(record, ["webhook_type"]));
  const eventTimestamp =
    toIsoTimestamp(source.event_timestamp) ??
    toIsoTimestamp(firstString(record, ["checking_out_at", "checkout_requested_at", "checking_in_at", "requested_at", "event_timestamp", "event_time", "gingr_updated_at", "status_changed_at"])) ??
    toIsoTimestamp(source.updated_at) ??
    toIsoTimestamp(firstString(record, ["updated_at", "created_at"])) ??
    new Date().toISOString();

  const photo =
    extractPhotoUrl(merged, nestedAnimal ?? {}, record) ??
    (typeof merged.image === "string" ? normalizePhotoUrl(merged.image) : null);

  return {
    gingr_reservation_id:
      source.reservation_id != null
        ? String(source.reservation_id)
        : firstString(record, ["reservation_id", "gingr_reservation_id", "id"]) ??
          firstString(nestedReservation ?? {}, ["id", "reservation_id"]),
    gingr_animal_id:
      source.animal_id != null
        ? String(source.animal_id)
        : firstString(record, ["animal_id", "gingr_animal_id", "pet_id"]) ??
          firstString(nestedAnimal ?? {}, ["id", "animal_id"]),
    animal_name: buildAnimalName(merged),
    owner_name: buildOwnerName(merged),
    photo_url: photo,
    reservation_type:
      firstString(record, ["reservation_type", "service", "type_name", "type"]) ??
      firstString(nestedReservation ?? {}, ["type", "type_name"]),
    room: buildRoom(merged),
    notes: firstString(record, ["notes", "note", "special_notes", "public_notes"]),
    flags: {
      source: direction ?? "unknown",
      status_string: firstString(record, ["status_string"])
    },
    status_started_at: eventTimestamp,
    completed_at: null as string | null,
    display_until: null as string | null,
    hidden: false
  };
}
