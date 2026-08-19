/**
 * Gingr Medication Report administration status.
 *
 * Official docs only list get_medication_info (schedules). The Gingr web app
 * loads administration history via the undocumented but live endpoint:
 *   GET /api/v1/get_medication_report_history?key=&reservation_id=
 *
 * Confirmed from Gingr frontend (common.js): history modal + Medication Report
 * UI match rows by date + animal_medication_schedule_id, with status options
 * and last_edited_at / last_edited_by metadata.
 */
import { createGingrClient } from "@/lib/integrations/gingr/client";
import { canCallGingrEndpoint, markGingrEndpointCalled } from "@/lib/gingr-request-guard";
import { requireTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import { fetchTlGingrResponse } from "./gingr-http";
import { readGingrText } from "./gingr-medication";
import type { TlGingrAdministrationStatus } from "./types";

export type GingrMedicationReportStatusOption = {
  value: string;
  label: string;
};

export type GingrMedicationAdministrationRecord = {
  date: string | null;
  animalMedicationScheduleId: string;
  statusValue: string | null;
  statusLabel: string | null;
  notes: string | null;
  lastEditedAtUnix: number | null;
  lastEditedBy: string | null;
};

export type GingrMedicationReportHistoryPayload = {
  animal?: unknown;
  data?: unknown;
  error?: unknown;
  message?: unknown;
  status?: unknown;
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

function readUnixSeconds(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  // History UI formats with moment(ts, "X") — seconds. Accept ms if clearly large.
  if (num > 1e12) return Math.floor(num / 1000);
  return Math.floor(num);
}

function normalizeStatusOptions(value: unknown): GingrMedicationReportStatusOption[] {
  if (!Array.isArray(value)) return [];
  const out: GingrMedicationReportStatusOption[] = [];
  for (const row of value) {
    const rec = asRecord(row);
    if (!rec) continue;
    const optionValue = readString(rec.value) ?? readString(rec.id);
    const label = readString(rec.label) ?? readString(rec.name) ?? readString(rec.status) ?? optionValue;
    if (!optionValue && !label) continue;
    out.push({ value: optionValue ?? label!, label: label ?? optionValue! });
  }
  return out;
}

function buildStatusLabelMap(options: GingrMedicationReportStatusOption[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const option of options) {
    map.set(option.value, option.label);
    map.set(option.label.toLowerCase(), option.label);
  }
  return map;
}

/** True when Gingr recorded that staff could not mark the dose administered. */
export function isUnableToAdministerReportStatus(statusValue: string | null, statusLabel: string | null): boolean {
  const haystack = `${statusLabel ?? ""} ${statusValue ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  if (/\bunable[\s_-]+to[\s_-]+administ/.test(haystack)) return true;
  if (/\bcannot[\s_-]+administ/.test(haystack)) return true;
  if (/\bcan['’]?t[\s_-]+administ/.test(haystack)) return true;
  if (/\brefused\b/.test(haystack)) return true;
  return false;
}

/** True when a Gingr medication report status means the dose was given. */
export function isAdministeredReportStatus(statusValue: string | null, statusLabel: string | null): boolean {
  const haystack = `${statusLabel ?? ""} ${statusValue ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  if (isUnableToAdministerReportStatus(statusValue, statusLabel)) return false;
  // Positive match first.
  if (/\badminist/.test(haystack) || /\bgiven\b/.test(haystack) || /\bcompleted\b/.test(haystack)) {
    // Exclude explicit negatives that still contain "administ" (rare).
    if (/\bnot[\s_-]*administ/.test(haystack)) return false;
    if (/\bunadminist/.test(haystack)) return false;
    return true;
  }
  return false;
}

function resolveStatusLabel(
  statusValue: string | null,
  statusLabel: string | null,
  labelByValue: Map<string, string>
): string | null {
  if (statusLabel) return statusLabel;
  if (!statusValue) return null;
  return labelByValue.get(statusValue) ?? labelByValue.get(statusValue.toLowerCase()) ?? null;
}

function normalizeAdministrationRow(
  value: unknown,
  labelByValue: Map<string, string>,
  fallbackScheduleId?: string
): GingrMedicationAdministrationRecord | null {
  const row = asRecord(value);
  if (!row) return null;

  const animalMedicationScheduleId =
    readString(row.animal_medication_schedule_id) ??
    readString(row.animalMedicationScheduleId) ??
    readString(row.medication_schedule_row_id) ??
    readString(fallbackScheduleId);
  if (!animalMedicationScheduleId) return null;

  const statusValue =
    readString(row.status) ??
    readString(row.report_status_id) ??
    readString(row.reportStatusId) ??
    readString(row.status_id);
  const explicitLabel = readString(row.status_label) ?? readString(row.statusLabel) ?? readString(row.label);
  const statusLabel = resolveStatusLabel(statusValue, explicitLabel, labelByValue);

  return {
    date: readString(row.date) ?? readString(row.report_date) ?? readString(row.service_date),
    animalMedicationScheduleId,
    statusValue,
    statusLabel,
    notes:
      readGingrText(row.notes) ??
      readGingrText(row.note) ??
      readGingrText(row.administration_notes) ??
      readGingrText(row.medication_notes) ??
      readGingrText(row.comment) ??
      readGingrText(row.comments) ??
      readGingrText(row.note_text),
    lastEditedAtUnix: readUnixSeconds(row.last_edited_at) ?? readUnixSeconds(row.lastEditedAt),
    lastEditedBy: readString(row.last_edited_by) ?? readString(row.lastEditedBy) ?? readString(row.employee_name)
  };
}

function isIsoDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function looksLikeAdministrationRow(row: Record<string, unknown>): boolean {
  return (
    "animal_medication_schedule_id" in row ||
    "animalMedicationScheduleId" in row ||
    "medication_schedule_row_id" in row ||
    "report_status_id" in row ||
    "reportStatusId" in row ||
    "last_edited_at" in row ||
    "lastEditedAt" in row ||
    "last_edited_by" in row ||
    "status" in row ||
    "notes" in row ||
    "note" in row
  );
}

function nestedDateFromRow(row: Record<string, unknown>, fallbackDate?: string): string | null {
  return readString(row.date) ?? readString(row.report_date) ?? readString(row.service_date) ?? fallbackDate ?? null;
}

/**
 * Flatten administrationData from either:
 * - array of { date, animal_medication_schedule_id, status, ... }
 * - object keyed by schedule id → { report_status_id, notes, ... } (reservation panel shape)
 * - nested date → schedule id (or schedule id → date) objects used by some Gingr report payloads
 */
export function flattenAdministrationData(
  administrationData: unknown,
  statusOptions: GingrMedicationReportStatusOption[] = [],
  fallbackDate?: string
): GingrMedicationAdministrationRecord[] {
  const labelByValue = buildStatusLabelMap(statusOptions);
  const out: GingrMedicationAdministrationRecord[] = [];

  const visit = (value: unknown, fallbackScheduleId?: string, nestedDate?: string, depth = 0) => {
    if (value == null || depth > 6) return;
    if (Array.isArray(value)) {
      for (const row of value) visit(row, fallbackScheduleId, nestedDate, depth + 1);
      return;
    }
    const rec = asRecord(value);
    if (!rec) return;

    const dateHere = nestedDateFromRow(rec, nestedDate);
    if (looksLikeAdministrationRow(rec) && (fallbackScheduleId || rec.animal_medication_schedule_id || rec.animalMedicationScheduleId)) {
      const normalized = normalizeAdministrationRow(rec, labelByValue, fallbackScheduleId);
      if (normalized) {
        if (!normalized.date && dateHere) normalized.date = dateHere;
        out.push(normalized);
      }
    }

    for (const [key, nested] of Object.entries(rec)) {
      if (
        key === "statuses" ||
        key === "statusOptions" ||
        key === "status_options" ||
        key === "medicationStatuses" ||
        key === "report_statuses"
      ) {
        continue;
      }
      const dateKey = isIsoDateKey(key) ? key : dateHere ?? undefined;
      const scheduleKey = !isIsoDateKey(key) && /^\d+$/.test(key) ? key : fallbackScheduleId;
      if (nested && typeof nested === "object") {
        visit(nested, scheduleKey ?? undefined, dateKey, depth + 1);
      }
    }
  };

  visit(administrationData, undefined, fallbackDate);
  return out;
}

function collectStatusOptionsFromNode(node: unknown): GingrMedicationReportStatusOption[] {
  const rec = asRecord(node);
  if (!rec) return [];
  return [
    ...normalizeStatusOptions(rec.statuses),
    ...normalizeStatusOptions(rec.statusOptions),
    ...normalizeStatusOptions(rec.status_options),
    ...normalizeStatusOptions(rec.medicationStatuses),
    ...normalizeStatusOptions(rec.report_statuses)
  ];
}

function collectAdministrationNodes(node: unknown): unknown[] {
  const rec = asRecord(node);
  if (!rec) return [];
  const nodes: unknown[] = [];
  if ("administrationData" in rec) nodes.push(rec.administrationData);
  if ("administration_data" in rec) nodes.push(rec.administration_data);
  if ("medication_report" in rec) nodes.push(rec.medication_report);
  if ("medicationReport" in rec) nodes.push(rec.medicationReport);
  return nodes;
}

/**
 * History payload shape (from Gingr UI):
 * { animal, data: [ { reservation, data: { administrationData, statuses, ... } } ] }
 * Also tolerate a flat { administrationData, statuses } root.
 *
 * When reservationId is provided, prefer that reservation's report block first
 * (history can include prior stays).
 */
export function extractAdministrationRecordsFromHistory(
  payload: GingrMedicationReportHistoryPayload | Record<string, unknown>,
  options?: { reservationId?: string | null }
): GingrMedicationAdministrationRecord[] {
  const root = asRecord(payload) ?? {};
  const statusOptions = collectStatusOptionsFromNode(root);
  const preferredReservationId = readString(options?.reservationId);
  const records: GingrMedicationAdministrationRecord[] = [];
  const preferredRecords: GingrMedicationAdministrationRecord[] = [];

  const pushFromNode = (node: unknown, into: GingrMedicationAdministrationRecord[]) => {
    const localStatuses = [...statusOptions, ...collectStatusOptionsFromNode(node)];
    for (const adminNode of collectAdministrationNodes(node)) {
      into.push(...flattenAdministrationData(adminNode, localStatuses));
    }
    const nested = asRecord(node)?.data;
    if (nested && nested !== node) {
      const nestedStatuses = [...localStatuses, ...collectStatusOptionsFromNode(nested)];
      for (const adminNode of collectAdministrationNodes(nested)) {
        into.push(...flattenAdministrationData(adminNode, nestedStatuses));
      }
    }
  };

  pushFromNode(root, records);

  const data = root.data;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const entryRec = asRecord(entry);
      const reservation = asRecord(entryRec?.reservation);
      const entryReservationId =
        readString(reservation?.id) ?? readString(reservation?.reservation_id) ?? readString(entryRec?.reservation_id);
      const bucket =
        preferredReservationId && entryReservationId === preferredReservationId ? preferredRecords : records;
      pushFromNode(entry, bucket);
      if (entryRec?.data) pushFromNode(entryRec.data, bucket);
    }
  } else if (data) {
    pushFromNode(data, records);
  }

  return preferredRecords.length ? preferredRecords : records;
}

export type ResolvedMedicationAdministration = {
  administrationStatus: TlGingrAdministrationStatus;
  administeredAt: string | null;
  administeredBy: string | null;
  administrationNotes: string | null;
  statusLabel: string | null;
};

export function resolveAdministrationForSchedule(options: {
  records: GingrMedicationAdministrationRecord[];
  animalMedicationScheduleId: string;
  serviceDate: string;
}): ResolvedMedicationAdministration {
  const scheduleId = String(options.animalMedicationScheduleId);
  const matches = options.records.filter((row) => {
    if (row.animalMedicationScheduleId !== scheduleId) return false;
    if (!row.date) return true; // undated object-keyed rows apply to current report context
    return row.date === options.serviceDate;
  });

  // Prefer exact date match; undated rows are already included when date is null.
  const dated = matches.filter((row) => row.date === options.serviceDate);
  const candidates = dated.length ? dated : matches;

  let best: GingrMedicationAdministrationRecord | null = null;
  for (const row of candidates) {
    if (!best) {
      best = row;
      continue;
    }
    const bestTs = best.lastEditedAtUnix ?? 0;
    const rowTs = row.lastEditedAtUnix ?? 0;
    if (rowTs >= bestTs) best = row;
  }

  if (!best || !isAdministeredReportStatus(best.statusValue, best.statusLabel)) {
    return {
      administrationStatus: "not_administered",
      administeredAt: null,
      administeredBy: null,
      administrationNotes: best?.notes ?? null,
      statusLabel: best?.statusLabel ?? best?.statusValue ?? null
    };
  }

  const administeredAt =
    best.lastEditedAtUnix != null ? new Date(best.lastEditedAtUnix * 1000).toISOString() : null;

  return {
    administrationStatus: "administered",
    administeredAt,
    administeredBy: best.lastEditedBy,
    administrationNotes: best.notes,
    statusLabel: best.statusLabel ?? best.statusValue
  };
}

/**
 * GET /api/v1/get_medication_report_history?key=&reservation_id=
 * Uses TL_GINGR_KEY. Never logs the API key or full URL with key.
 */
export async function fetchGingrMedicationReportHistory(
  reservationId: string
): Promise<GingrMedicationReportHistoryPayload> {
  const trimmedReservationId = String(reservationId ?? "").trim();
  if (!trimmedReservationId) {
    throw new Error("reservation_id is required for get_medication_report_history.");
  }

  const apiKey = requireTlGingrApiKey();
  const { subdomain } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain });

  if (!canCallGingrEndpoint("medication_report_history")) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  markGingrEndpointCalled("medication_report_history");

  const url = new URL(`${client.config.baseUrl}/api/v1/get_medication_report_history`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("reservation_id", trimmedReservationId);

  const response = await fetchTlGingrResponse(
    url.toString(),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    },
    "Gingr get_medication_report_history"
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Gingr get_medication_report_history ${response.status}: ${text.slice(0, 180) || response.statusText}`
    );
  }

  const json = (await response.json()) as GingrMedicationReportHistoryPayload;
  const root = asRecord(json);
  if (root && (root.error === true || root.status === "error")) {
    const message = readString(root.message) ?? "get_medication_report_history returned an error.";
    throw new Error(message);
  }
  return json;
}
