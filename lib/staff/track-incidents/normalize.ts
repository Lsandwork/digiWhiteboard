import type { GingrWebhookPayload } from "@/lib/gingr";
import type { TrackIncidentPriority, TrackIncidentStatus } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOccurredAt(data: UnknownRecord): string | null {
  const iso = str(data.created_at_iso);
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const createdAt = str(data.created_at);
  if (createdAt) {
    // Gingr sometimes sends unix seconds as a string
    if (/^\d{10}$/.test(createdAt)) {
      return new Date(Number(createdAt) * 1000).toISOString();
    }
    if (/^\d{13}$/.test(createdAt)) {
      return new Date(Number(createdAt)).toISOString();
    }
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export function buildIncidentNumber(gingrIncidentId: string, occurredAt: string | null): string {
  const year = occurredAt ? new Date(occurredAt).getUTCFullYear() : new Date().getUTCFullYear();
  const id = gingrIncidentId.replace(/\D/g, "") || gingrIncidentId.slice(0, 12);
  return `INC-${year}-${id}`;
}

export type NormalizedGingrIncident = {
  gingr_incident_id: string;
  incident_number: string;
  occurred_at: string | null;
  dog_name: string;
  gingr_animal_id: string | null;
  owner_name: string;
  gingr_owner_id: string | null;
  incident_type: string;
  incident_type_id: string | null;
  reported_by: string;
  reported_by_username: string | null;
  location_name: string | null;
  location_id: string | null;
  notes: string;
  raw_payload: UnknownRecord;
};

export function normalizeGingrIncidentPayload(payload: GingrWebhookPayload): NormalizedGingrIncident | null {
  const data = asRecord(payload.entity_data);
  const gingrId = str(data.id) || str(payload.entity_id);
  if (!gingrId || !/^\d+$/.test(gingrId)) return null;

  const occurredAt = parseOccurredAt(data);
  const first = str(data.first_name);
  const last = str(data.last_name);
  const ownerName = [first, last].filter(Boolean).join(" ") || str(data.owner_name) || "Unknown owner";
  const reportedBy =
    str(data.created_by) || str(data.username) || str(data.reported_by) || "Gingr staff";

  return {
    gingr_incident_id: gingrId,
    incident_number: buildIncidentNumber(gingrId, occurredAt),
    occurred_at: occurredAt,
    dog_name: str(data.animal_name) || "Unknown dog",
    gingr_animal_id: str(data.animal_id) || str(data.a_id) || null,
    owner_name: ownerName,
    gingr_owner_id: str(data.o_id) || null,
    incident_type: str(data.type) || "Incident",
    incident_type_id: str(data.incident_type_id) || null,
    reported_by: reportedBy,
    reported_by_username: str(data.username) || null,
    location_name: str(data.location_name) || null,
    location_id: str(data.location_id) || null,
    notes: str(data.notes),
    raw_payload: { ...payload }
  };
}

export function isValidStatus(value: unknown): value is TrackIncidentStatus {
  return value === "new" || value === "in_progress" || value === "follow_up_needed" || value === "resolved";
}

export function isValidPriority(value: unknown): value is TrackIncidentPriority {
  return value === "high" || value === "medium" || value === "low";
}
