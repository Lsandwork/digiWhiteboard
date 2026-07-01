import type { LiveDog } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

const promptBooleanKeys = ["checkout_prompted", "prompted", "user_prompted"];
const promptActorKeys = [
  "prompted_by_user_id",
  "prompted_by",
  "prompted_by_name",
  "checkout_requested_by",
  "checkout_prompted_by",
  "user_prompted_by"
];
const promptTimestampKeys = [
  "checkout_prompted_at",
  "checkout_requested_at",
  "checking_out_prompted_at",
  "prompted_at",
  "user_prompted_at"
];
const userActionTimestampKeys = ["ready_for_pickup_at"];

const promptEventTypes = new Set([
  "checkout_prompted",
  "checkout prompted",
  "checkout requested",
  "checkout_requested",
  "ready for pickup",
  "ready_for_pickup",
  "send to front",
  "send_to_front",
  "pickup requested",
  "pickup_requested",
  "handler alert",
  "handler_alert"
]);

const promptBoardActions = new Set(["checking out prompted", "ready for pickup", "send to front"]);
const promptSources = new Set(["gingr prompt", "user prompt", "coordinator prompt", "admin prompt"]);
const scheduledOnlyStatuses = new Set([
  "going home",
  "going_home",
  "departure",
  "leaving",
  "pickup",
  "scheduled pickup",
  "scheduled_pickup",
  "expected departure",
  "expected_departure",
  "reservation ending",
  "reservation_ending",
  "boarding checkout",
  "boarding_checkout",
  "checking out soon"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") : "";
}

function hasTruthy(record: UnknownRecord, keys: string[]) {
  return keys.some((key) => {
    const value = record[key];
    if (value === true) return true;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") return ["true", "1", "yes"].includes(value.trim().toLowerCase());
    return false;
  });
}

function hasValue(record: UnknownRecord, keys: string[]) {
  return keys.some((key) => {
    const value = record[key];
    return value != null && String(value).trim() !== "";
  });
}

function firstValue(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim() !== "") return String(value);
  }
  return null;
}

function firstToken(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const token = normalizeToken(record[key]);
    if (token) return token;
  }
  return "";
}

function flattenPromptRecords(record: UnknownRecord) {
  const nested = [
    record,
    isRecord(record.entity_data) ? record.entity_data : null,
    isRecord(record.payload) ? record.payload : null,
    isRecord(record.record) ? record.record : null,
    isRecord(record.reservation) ? record.reservation : null
  ].filter(Boolean) as UnknownRecord[];

  return nested;
}

export function isPromptedCheckoutRecord(record: UnknownRecord | null | undefined) {
  if (!record) return false;

  const records = flattenPromptRecords(record);
  const hasActor = records.some((item) => hasValue(item, promptActorKeys));
  const hasPromptTimestamp = records.some((item) => hasValue(item, promptTimestampKeys));
  const hasUserActionTimestamp = records.some((item) => hasValue(item, userActionTimestampKeys));
  const hasPromptBoolean = records.some((item) => hasTruthy(item, promptBooleanKeys));
  const hasPromptEvent = records.some((item) => {
    const eventType = firstToken(item, ["gingr_event_type", "event_type", "webhook_type", "action"]);
    const boardAction = firstToken(item, ["board_action"]);
    const source = firstToken(item, ["source"]);
    return promptEventTypes.has(eventType) || promptBoardActions.has(boardAction) || promptSources.has(source);
  });

  if (hasPromptBoolean || hasPromptEvent) return true;
  if (hasActor && (hasPromptTimestamp || hasUserActionTimestamp)) return true;

  const source = firstToken(record, ["source"]);
  const webhookType = firstToken(record, ["webhook_type"]);
  if (source === "gingr webhook" && webhookType === "checking out") return true;

  return false;
}

export function getCheckoutFilterReason(record: UnknownRecord | null | undefined) {
  if (!record) return "filtered: missing checkout prompt record";
  if (isPromptedCheckoutRecord(record)) return "prompted checkout";

  const records = flattenPromptRecords(record);
  const status = records
    .map((item) => firstToken(item, ["status", "status_string", "board_status", "direction", "event_type", "type", "action"]))
    .find(Boolean);
  if (status && scheduledOnlyStatuses.has(status)) return "filtered: scheduled departure only";

  const hasScheduleOnly = records.some((item) =>
    hasValue(item, [
      "going_home",
      "departure_date",
      "pickup_time",
      "reservation_end",
      "expected_checkout_time",
      "scheduled_checkout_at",
      "boarding_checkout_date",
      "lodging_departure_date",
      "end_date"
    ])
  );

  if (hasScheduleOnly) return "filtered: missing checkout_prompted";
  return "filtered: no Gingr user action found";
}

export function isPromptedCheckoutDog(dog: LiveDog) {
  if (dog.display_status !== "checking_out") return false;
  if (dog.raw_payload && isPromptedCheckoutRecord(dog.raw_payload)) return true;
  return false;
}

export function getCheckoutPromptTimestamp(record: UnknownRecord | null | undefined) {
  if (!record) return null;
  for (const item of flattenPromptRecords(record)) {
    const timestamp =
      firstValue(item, [...promptTimestampKeys, ...userActionTimestampKeys, "event_timestamp", "event_time", "created_at"]) ??
      null;
    if (timestamp) return timestamp;
  }
  return null;
}

export function getCheckoutPromptKey(dog: LiveDog) {
  const promptTimestamp = getCheckoutPromptTimestamp(dog.raw_payload);
  const promptId =
    dog.raw_payload && isRecord(dog.raw_payload)
      ? firstValue(dog.raw_payload, ["gingr_event_id", "checkout_prompt_event_id", "event_id"])
      : null;
  if (promptId) return `${dog.gingr_reservation_id ?? "no-reservation"}::${promptId}`;
  if (promptTimestamp) return `${dog.gingr_reservation_id ?? dog.id}::${dog.gingr_animal_id ?? dog.id}::${promptTimestamp}`;
  return null;
}
