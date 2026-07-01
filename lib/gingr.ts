import { createHmac, timingSafeEqual } from "crypto";
import { normalizeBoardDog, type BoardDogSource } from "@/lib/board-dog";
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

export type NormalizedDog = ReturnType<typeof normalizeBoardDog>;

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

  const entityId = payload.entity_id == null ? "" : String(payload.entity_id);
  const message = `${payload.webhook_type ?? ""}${entityId}${payload.entity_type ?? ""}`;
  const expected = createHmac("sha256", key).update(message).digest("hex");
  const received = String(payload.signature);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
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
  const reservationId = data.reservation_id ?? data.id ?? payload.entity_id;
  const animalId = data.animal_id ?? data.pet_id;
  const source: BoardDogSource = {
    record: {
      ...data,
      webhook_type: payload.webhook_type,
      reservation_id: reservationId,
      animal_id: animalId
    },
    direction: null,
    reservation_id: reservationId == null ? null : String(reservationId),
    animal_id: animalId == null ? null : String(animalId),
    event_timestamp:
      (typeof data.event_time === "string" || typeof data.event_time === "number" ? data.event_time : null) ??
      (typeof data.event_timestamp === "string" || typeof data.event_timestamp === "number" ? data.event_timestamp : null) ??
      (typeof data.updated_at === "string" ? data.updated_at : null),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : typeof data.created_at === "string" ? data.created_at : null
  };

  const normalized = normalizeBoardDog(source);
  const merged = { ...data };
  const flags = Object.fromEntries(flagKeys.map((key) => [key, hasFlag(merged, key)]));

  return {
    ...normalized,
    photo_url: normalized.photo_url ?? extractPhotoUrl(data),
    flags: {
      ...flags,
      ...normalized.flags
    }
  };
}

export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
