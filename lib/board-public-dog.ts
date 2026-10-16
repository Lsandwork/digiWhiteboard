import { photoKeys } from "@/lib/board-utils";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

/**
 * Keys the board clients actually read from raw_payload (checkout prompt detection, prompt timestamps,
 * breed label, photo fallback). Everything else — webhook signature, owner contact details, medical
 * notes, internal ids — never leaves the server on unauthenticated feeds.
 */
const SCALAR_KEYS = new Set<string>([
  "source",
  "webhook_type",
  "gingr_event_type",
  "event_type",
  "action",
  "board_action",
  "type",
  "status",
  "status_string",
  "board_status",
  "direction",
  "added_to_basket",
  "basket_added",
  "checkout_basket_added",
  "in_checkout_basket",
  "in_basket",
  "added_to_basket_at",
  "basket_added_at",
  "checkout_basket_added_at",
  "checkout_basket_at",
  "basket_event_at",
  "event_timestamp",
  "event_time",
  "created_at",
  "gingr_event_id",
  "checkout_prompt_event_id",
  "event_id",
  "going_home",
  "departure_date",
  "pickup_time",
  "reservation_end",
  "expected_checkout_time",
  "scheduled_checkout_at",
  "boarding_checkout_date",
  "lodging_departure_date",
  "end_date",
  "breed",
  "breed_name",
  "animal_breed",
  "a_breed",
  "pet_breed",
  "dog_breed",
  "demo"
]);

/** Dog name inside the nested `animal` object (breed-label fallback); `name` elsewhere may be a person. */
const ANIMAL_ONLY_KEYS = new Set<string>(["name"]);

/** Presence-only: the board checks that a staff actor exists, never who it was. */
const PRESENCE_ONLY_KEYS = new Set<string>([
  "basket_added_by",
  "basket_added_by_user_id",
  "checkout_basket_added_by",
  "checkout_basket_added_by_user_id"
]);

const PHOTO_KEYS = new Set<string>(photoKeys);
const PHOTO_URL_FIELDS = ["url", "href", "src", "path", "link", "original", "large", "medium", "small"];
const NESTED_KEYS = new Set<string>(["entity_data", "payload", "record", "reservation", "animal"]);
const MAX_DEPTH = 3;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function pickPhoto(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  const picked: UnknownRecord = {};
  for (const field of PHOTO_URL_FIELDS) {
    if (typeof value[field] === "string") picked[field] = value[field];
  }
  return Object.keys(picked).length ? picked : undefined;
}

function sanitizeRecord(record: UnknownRecord, depth: number, container: string | null): UnknownRecord {
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if ((SCALAR_KEYS.has(key) || (container === "animal" && ANIMAL_ONLY_KEYS.has(key))) && isScalar(value)) {
      out[key] = value;
    } else if (PRESENCE_ONLY_KEYS.has(key)) {
      if (value != null && String(value).trim() !== "") out[key] = true;
    } else if (PHOTO_KEYS.has(key)) {
      const photo = pickPhoto(value);
      if (photo !== undefined) out[key] = photo;
    } else if (NESTED_KEYS.has(key) && isRecord(value) && depth < MAX_DEPTH) {
      out[key] = sanitizeRecord(value, depth + 1, key);
    }
  }
  return out;
}

export function toPublicRawPayload(raw: unknown): UnknownRecord | null {
  if (!isRecord(raw)) return null;
  return sanitizeRecord(raw, 0, null);
}

/** LiveDog safe for unauthenticated board feeds. */
export function toPublicBoardDog<T extends LiveDog>(dog: T): T {
  return { ...dog, raw_payload: toPublicRawPayload(dog.raw_payload) };
}

export function toPublicBoardDogs<T extends LiveDog>(dogs: T[]): T[] {
  return dogs.map(toPublicBoardDog);
}

export function toPublicLiveBoardResponse(response: LiveBoardResponse): LiveBoardResponse {
  return {
    ...response,
    checking_in: toPublicBoardDogs(response.checking_in),
    checking_out: toPublicBoardDogs(response.checking_out)
  };
}
