import { createHmac, timingSafeEqual } from "crypto";
import { extractPhotoUrl } from "@/lib/board-utils";

type UnknownRecord = Record<string, unknown>;

export type GingrWebhookPayload = {
  webhook_type?: string;
  entity_id?: string | number;
  entity_type?: string;
  signature?: string;
  entity_data?: UnknownRecord;
  [key: string]: unknown;
};

export type NormalizedDog = {
  gingr_reservation_id: string | null;
  gingr_animal_id: string | null;
  animal_name: string;
  owner_name: string | null;
  photo_url: string | null;
  reservation_type: string | null;
  room: string | null;
  notes: string | null;
  flags: Record<string, boolean>;
};

const flagKeys = [
  "vip",
  "meds",
  "allergies",
  "incident",
  "grooming",
  "training",
  "boarding",
  "daycare",
  "taxi"
] as const;

export function verifyGingrSignature(payload: GingrWebhookPayload, key: string | undefined) {
  if (!key || !payload.signature) {
    return false;
  }

  const message = `${payload.webhook_type ?? ""}${payload.entity_id ?? ""}${payload.entity_type ?? ""}`;
  const expected = createHmac("sha256", key).update(message).digest("hex");
  const received = String(payload.signature);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function hasFlag(data: UnknownRecord, key: string) {
  const direct = data[key];
  if (typeof direct === "boolean") return direct;
  if (typeof direct === "string") return ["true", "yes", "1", key].includes(direct.toLowerCase());

  const flags = data.flags;
  if (flags && typeof flags === "object" && !Array.isArray(flags)) {
    const value = (flags as UnknownRecord)[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["true", "yes", "1", key].includes(value.toLowerCase());
  }

  const labels = data.labels ?? data.tags ?? data.badges;
  if (Array.isArray(labels)) {
    return labels.some((label) => String(label).toLowerCase().includes(key));
  }

  return false;
}

export function normalizeDog(payload: GingrWebhookPayload): NormalizedDog {
  const data = payload.entity_data ?? {};
  const animal = typeof data.animal === "object" && data.animal ? (data.animal as UnknownRecord) : {};
  const owner = typeof data.owner === "object" && data.owner ? (data.owner as UnknownRecord) : {};
  const reservation = typeof data.reservation === "object" && data.reservation ? (data.reservation as UnknownRecord) : {};

  const merged = { ...reservation, ...data, ...animal };
  const ownerName =
    firstString(data, ["owner_name", "customer_name", "client_name"]) ??
    firstString(owner, ["name", "full_name", "first_name"]);

  const animalName =
    firstString(animal, ["name", "animal_name", "pet_name"]) ??
    firstString(data, ["animal_name", "pet_name", "dog_name", "name"]) ??
    "Unknown Dog";

  const flags = Object.fromEntries(flagKeys.map((key) => [key, hasFlag(merged, key)]));

  return {
    gingr_reservation_id:
      firstString(data, ["reservation_id", "gingr_reservation_id", "id"]) ??
      firstString(reservation, ["id", "reservation_id"]) ??
      (payload.entity_type === "reservation" ? String(payload.entity_id ?? "") : null),
    gingr_animal_id:
      firstString(data, ["animal_id", "gingr_animal_id", "pet_id"]) ??
      firstString(animal, ["id", "animal_id"]) ??
      (payload.entity_type === "animal" ? String(payload.entity_id ?? "") : null),
    animal_name: animalName,
    owner_name: ownerName,
    photo_url: extractPhotoUrl(animal, reservation, data, payload as UnknownRecord),
    reservation_type: firstString(data, ["reservation_type", "service", "type_name"]) ?? firstString(reservation, ["type", "type_name"]),
    room: firstString(data, ["room", "area", "location", "run_name"]) ?? firstString(reservation, ["room", "area"]),
    notes: firstString(data, ["notes", "note", "special_notes", "public_notes"]),
    flags
  };
}

export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
