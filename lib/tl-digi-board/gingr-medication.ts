import { createGingrClient } from "@/lib/integrations/gingr/client";
import { canCallGingrEndpoint, markGingrEndpointCalled } from "@/lib/gingr-request-guard";
import { TL_FITDOG_SCHEDULE_ID_MAP, type TlMedicationPeriod } from "./constants";
import { requireTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import { normalizeScheduleLabel } from "./medication-windows";
import type { TlMedicationScheduleKind } from "./types";

/** Live Fitdog shape: medicationSchedules[].id / .time (e.g. "1"/"AM", "2"/"MIDDAY"). */
export type GingrMedicationScheduleDef = {
  id: string;
  time: string;
};

/**
 * Live Fitdog animal_medication_schedules item (schedule definition only).
 * Administration status comes from get_medication_report_history, not this payload.
 */
export type GingrAnimalMedicationScheduleItem = {
  id: string;
  medication_schedule_id: string;
  medication_notes?: { value?: string | null; value_string?: string | null } | string | null;
  medication_amount?: { value?: string | null; value_string?: string | null } | null;
  medication_type?: { value?: string | null; value_string?: string | null } | null;
  medication_unit?: { value?: string | null; value_string?: string | null } | null;
  /** Extra Gingr note fields that are not the primary medication_notes instruction. */
  sourceNotes?: string | null;
};

export type GingrMedicationInfoPayload = {
  medicationSchedules?: GingrMedicationScheduleDef[];
  /** OBJECT keyed by schedule_id → array of items (Fitdog live shape). */
  animal_medication_schedules?:
    | Record<string, GingrAnimalMedicationScheduleItem[] | GingrAnimalMedicationScheduleItem>
    | GingrAnimalMedicationScheduleItem[];
};

export type ResolvedGingrMedicationSchedule = {
  item: GingrAnimalMedicationScheduleItem;
  scheduleId: string;
  gingrScheduleLabel: string;
  scheduleKind: TlMedicationScheduleKind;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function readFieldValue(field: unknown): string | null {
  return readGingrText(field);
}

/** Gingr custom fields may be a string, { value, value_string }, or nested HTML-ish text. */
export function readGingrText(value: unknown, depth = 0): string | null {
  if (value == null || depth > 4) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return null;
  if (typeof value === "string") {
    const stripped = value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    return stripped || null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => readGingrText(item, depth + 1)).filter(Boolean) as string[];
    return uniqueNoteParts(parts).join(" · ") || null;
  }
  const row = asRecord(value);
  if (!row) return null;
  return (
    readGingrText(row.value_string, depth + 1) ??
    readGingrText(row.value, depth + 1) ??
    readGingrText(row.text, depth + 1) ??
    readGingrText(row.html, depth + 1) ??
    readGingrText(row.notes, depth + 1) ??
    readGingrText(row.note, depth + 1)
  );
}

const EXTRA_NOTE_KEYS = [
  "notes",
  "note",
  "comments",
  "comment",
  "instructions",
  "special_instructions",
  "medication_instructions",
  "administration_notes",
  "note_text",
  "medication_note"
];

export function uniqueNoteParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = String(part || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function extraNotesFromRow(row: Record<string, unknown>, skip?: string | null): string | null {
  const skipKey = skip?.trim().toLowerCase() ?? "";
  const parts: string[] = [];
  for (const key of EXTRA_NOTE_KEYS) {
    if (!(key in row)) continue;
    const text = readGingrText(row[key]);
    if (!text) continue;
    if (skipKey && text.toLowerCase() === skipKey) continue;
    parts.push(text);
  }
  return uniqueNoteParts(parts).join(" · ") || null;
}

/** Flatten animal_medication_schedules object (or array) into a list of schedule items. */
export function flattenAnimalMedicationSchedules(
  animalMedicationSchedules: GingrMedicationInfoPayload["animal_medication_schedules"]
): GingrAnimalMedicationScheduleItem[] {
  if (!animalMedicationSchedules) return [];

  if (Array.isArray(animalMedicationSchedules)) {
    return animalMedicationSchedules
      .map((row) => normalizeScheduleItem(row))
      .filter((item): item is GingrAnimalMedicationScheduleItem => Boolean(item));
  }

  const out: GingrAnimalMedicationScheduleItem[] = [];
  for (const [scheduleId, value] of Object.entries(animalMedicationSchedules)) {
    const rows = Array.isArray(value) ? value : [value];
    for (const row of rows) {
      const item = normalizeScheduleItem(row, scheduleId);
      if (item) out.push(item);
    }
  }
  return out;
}

function normalizeScheduleItem(
  value: unknown,
  fallbackScheduleId?: string
): GingrAnimalMedicationScheduleItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = readString(row.id);
  if (!id) return null;
  const medication_schedule_id =
    readString(row.medication_schedule_id) ?? readString(fallbackScheduleId) ?? "";
  const notesObject = asRecord(row.medication_notes);
  const notesText = readGingrText(row.medication_notes);
  return {
    id,
    medication_schedule_id,
    medication_notes: notesObject
      ? (notesObject as GingrAnimalMedicationScheduleItem["medication_notes"])
      : notesText
        ? { value: notesText, value_string: notesText }
        : null,
    medication_amount: asRecord(row.medication_amount) as GingrAnimalMedicationScheduleItem["medication_amount"],
    medication_type: asRecord(row.medication_type) as GingrAnimalMedicationScheduleItem["medication_type"],
    medication_unit: asRecord(row.medication_unit) as GingrAnimalMedicationScheduleItem["medication_unit"],
    sourceNotes: extraNotesFromRow(row, notesText)
  };
}

export function buildMedicationScheduleLabelMap(
  medicationSchedules: GingrMedicationScheduleDef[] | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of medicationSchedules ?? []) {
    const id = readString(row?.id);
    const time = readString(row?.time);
    if (id && time) map.set(id, time);
  }
  return map;
}

/**
 * Resolve schedule kind from Fitdog schedule id map (optional) then medicationSchedules label.
 * Unknown labels → other_special via normalizeScheduleLabel.
 */
export function resolveMedicationSchedule(
  item: GingrAnimalMedicationScheduleItem,
  scheduleLabelById: Map<string, string>,
  scheduleIdMap: Record<string, TlMedicationPeriod> = TL_FITDOG_SCHEDULE_ID_MAP
): ResolvedGingrMedicationSchedule {
  const scheduleId = String(item.medication_schedule_id ?? "").trim();
  const labelFromApi = scheduleLabelById.get(scheduleId) ?? null;
  const mappedPeriod = scheduleId ? scheduleIdMap[scheduleId] : undefined;

  if (mappedPeriod) {
    return {
      item,
      scheduleId,
      gingrScheduleLabel: labelFromApi ?? mappedPeriod.toUpperCase().replace("_", "-"),
      scheduleKind: mappedPeriod
    };
  }

  const normalized = normalizeScheduleLabel(labelFromApi);
  return {
    item,
    scheduleId,
    gingrScheduleLabel: normalized.gingrScheduleLabel,
    scheduleKind: normalized.kind
  };
}

export function flattenAndResolveMedicationSchedules(
  payload: GingrMedicationInfoPayload,
  scheduleIdMap: Record<string, TlMedicationPeriod> = TL_FITDOG_SCHEDULE_ID_MAP
): ResolvedGingrMedicationSchedule[] {
  const labelMap = buildMedicationScheduleLabelMap(payload.medicationSchedules);
  return flattenAnimalMedicationSchedules(payload.animal_medication_schedules).map((item) =>
    resolveMedicationSchedule(item, labelMap, scheduleIdMap)
  );
}

export function medicationNameFromItem(item: GingrAnimalMedicationScheduleItem): string {
  return readFieldValue(item.medication_type) ?? "Medication";
}

export function dosageFromItem(item: GingrAnimalMedicationScheduleItem): string | null {
  const amount = readFieldValue(item.medication_amount);
  const unit = readFieldValue(item.medication_unit);
  if (amount && unit) return `${amount} ${unit}`;
  if (amount) return amount;
  if (unit) return unit;
  return null;
}

export function notesFromItem(item: GingrAnimalMedicationScheduleItem): string | null {
  return readGingrText(item.medication_notes);
}

export function extraNotesFromItem(item: GingrAnimalMedicationScheduleItem): string | null {
  return readGingrText(item.sourceNotes);
}

function unwrapMedicationPayload(payload: unknown): GingrMedicationInfoPayload {
  const root = asRecord(payload);
  if (!root) return {};
  if ("data" in root && root.data && typeof root.data === "object") {
    const data = asRecord(root.data);
    if (data) return data as GingrMedicationInfoPayload;
  }
  return root as GingrMedicationInfoPayload;
}

/**
 * GET /api/v1/get_medication_info?key=&animal_id=
 * Uses TL_GINGR_KEY server-side (separate from GINGR_API_KEY). Never logs the API key.
 */
export async function fetchGingrMedicationInfo(animalId: string): Promise<GingrMedicationInfoPayload> {
  const trimmedAnimalId = String(animalId ?? "").trim();
  if (!trimmedAnimalId) {
    throw new Error("animal_id is required for get_medication_info.");
  }

  const apiKey = requireTlGingrApiKey();
  const { subdomain } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain });

  // Soft gate — sync owns concurrency; never punch through if another call is mid-flight spacing.
  if (!canCallGingrEndpoint("medication_info")) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  markGingrEndpointCalled("medication_info");

  const url = new URL(`${client.config.baseUrl}/api/v1/get_medication_info`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("animal_id", trimmedAnimalId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Do not include request URL (contains key) in error messages.
    throw new Error(
      `Gingr get_medication_info ${response.status}: ${text.slice(0, 180) || response.statusText}`
    );
  }

  const json = await response.json();
  return unwrapMedicationPayload(json);
}
