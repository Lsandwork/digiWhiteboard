type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import type { GingrWebhookPayload } from "@/lib/gingr";
import { normalizeGingrIncidentPayload } from "./normalize";
import type {
  TrackIncident,
  TrackIncidentListFilters,
  TrackIncidentPriority,
  TrackIncidentStatus,
  TrackIncidentSummary
} from "./types";

const SORTABLE: Record<string, string> = {
  occurred_at: "occurred_at",
  incident_number: "incident_number",
  dog_name: "dog_name",
  owner_name: "owner_name",
  incident_type: "incident_type",
  status: "status",
  priority: "priority",
  source: "source",
  reported_by: "reported_by",
  created_at: "created_at",
  updated_at: "updated_at"
};

function mapRow(row: Record<string, unknown>): TrackIncident {
  return {
    id: String(row.id),
    incident_number: String(row.incident_number ?? ""),
    gingr_incident_id: row.gingr_incident_id != null ? String(row.gingr_incident_id) : null,
    occurred_at: row.occurred_at != null ? String(row.occurred_at) : null,
    source: row.source === "manual" ? "manual" : "gingr",
    dog_name: String(row.dog_name ?? ""),
    dog_breed: row.dog_breed != null ? String(row.dog_breed) : null,
    gingr_animal_id: row.gingr_animal_id != null ? String(row.gingr_animal_id) : null,
    owner_name: String(row.owner_name ?? ""),
    gingr_owner_id: row.gingr_owner_id != null ? String(row.gingr_owner_id) : null,
    incident_type: String(row.incident_type ?? "Incident"),
    incident_type_id: row.incident_type_id != null ? String(row.incident_type_id) : null,
    reported_by: String(row.reported_by ?? ""),
    reported_by_username: row.reported_by_username != null ? String(row.reported_by_username) : null,
    status: (row.status as TrackIncidentStatus) || "new",
    assigned_to_user_id: row.assigned_to_user_id != null ? String(row.assigned_to_user_id) : null,
    assigned_to_name: row.assigned_to_name != null ? String(row.assigned_to_name) : null,
    priority: (row.priority as TrackIncidentPriority) || "medium",
    location_name: row.location_name != null ? String(row.location_name) : null,
    location_id: row.location_id != null ? String(row.location_id) : null,
    notes: String(row.notes ?? ""),
    latest_update: row.latest_update != null ? String(row.latest_update) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null
  };
}

export async function upsertIncidentFromGingrWebhook(
  supabase: SupabaseClient,
  payload: GingrWebhookPayload,
  webhookEventId?: string | null
): Promise<{ record: TrackIncident; created: boolean } | null> {
  const normalized = normalizeGingrIncidentPayload(payload);
  if (!normalized) return null;

  const { data: existing } = await supabase
    .from("track_incidents")
    .select("*")
    .eq("gingr_incident_id", normalized.gingr_incident_id)
    .maybeSingle();

  const base = {
    incident_number: normalized.incident_number,
    gingr_incident_id: normalized.gingr_incident_id,
    occurred_at: normalized.occurred_at,
    source: "gingr" as const,
    dog_name: normalized.dog_name,
    gingr_animal_id: normalized.gingr_animal_id,
    owner_name: normalized.owner_name,
    gingr_owner_id: normalized.gingr_owner_id,
    incident_type: normalized.incident_type,
    incident_type_id: normalized.incident_type_id,
    reported_by: normalized.reported_by,
    reported_by_username: normalized.reported_by_username,
    location_name: normalized.location_name,
    location_id: normalized.location_id,
    notes: normalized.notes,
    raw_payload: normalized.raw_payload,
    gingr_webhook_event_id: webhookEventId ?? null,
    latest_update: existing
      ? `Synced from Gingr ${new Date().toISOString()}`
      : `Imported from Gingr webhook ${new Date().toISOString()}`
  };

  if (existing) {
    const { data, error } = await supabase
      .from("track_incidents")
      .update(base)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { record: mapRow(data as Record<string, unknown>), created: false };
  }

  const { data, error } = await supabase
    .from("track_incidents")
    .insert({
      ...base,
      status: "new",
      priority: "medium"
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { record: mapRow(data as Record<string, unknown>), created: true };
}

export async function listTrackIncidents(supabase: SupabaseClient, filters: TrackIncidentListFilters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = SORTABLE[filters.sortBy ?? "occurred_at"] ?? "occurred_at";
  const ascending = filters.sortDir === "asc";

  let query = supabase.from("track_incidents").select("*", { count: "exact" });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.source && filters.source !== "all") query = query.eq("source", filters.source);
  if (filters.incidentType && filters.incidentType !== "all") {
    query = query.eq("incident_type", filters.incidentType);
  }
  if (filters.dateFrom) query = query.gte("occurred_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("occurred_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const term = filters.q.trim().replace(/,/g, "");
    query = query.or(
      `dog_name.ilike.%${term}%,owner_name.ilike.%${term}%,incident_type.ilike.%${term}%,incident_number.ilike.%${term}%,reported_by.ilike.%${term}%,notes.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query.order(sortBy, { ascending, nullsFirst: false }).range(from, to);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function getTrackIncidentSummary(supabase: SupabaseClient): Promise<TrackIncidentSummary> {
  const { data, error } = await supabase
    .from("track_incidents")
    .select("status, created_at, occurred_at")
    .limit(10_000);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  let inProgress = 0;
  let resolved = 0;
  let newToday = 0;
  for (const row of rows) {
    if (row.status === "in_progress" || row.status === "follow_up_needed") inProgress += 1;
    if (row.status === "resolved") resolved += 1;
    const stamp = String(row.created_at ?? row.occurred_at ?? "");
    if (stamp && stamp >= todayIso) newToday += 1;
  }

  return {
    total: rows.length,
    inProgress,
    resolved,
    newToday
  };
}

export async function createManualTrackIncident(
  supabase: SupabaseClient,
  input: {
    dog_name: string;
    owner_name?: string;
    dog_breed?: string | null;
    incident_type: string;
    notes?: string;
    reported_by: string;
    occurred_at?: string | null;
    priority?: TrackIncidentPriority;
    assigned_to_user_id?: string | null;
    assigned_to_name?: string | null;
  }
) {
  const dog = String(input.dog_name ?? "").trim();
  const type = String(input.incident_type ?? "").trim();
  if (!dog) throw new Error("Dog name is required.");
  if (!type) throw new Error("Incident type is required.");

  const occurredAt = input.occurred_at ? new Date(input.occurred_at).toISOString() : new Date().toISOString();
  const year = new Date(occurredAt).getUTCFullYear();
  const suffix = Date.now().toString().slice(-6);
  const incidentNumber = `INC-${year}-M${suffix}`;

  const { data, error } = await supabase
    .from("track_incidents")
    .insert({
      incident_number: incidentNumber,
      gingr_incident_id: null,
      occurred_at: occurredAt,
      source: "manual",
      dog_name: dog,
      dog_breed: input.dog_breed ?? null,
      owner_name: String(input.owner_name ?? "").trim(),
      incident_type: type,
      reported_by: String(input.reported_by ?? "").trim() || "Staff",
      status: "new",
      priority: input.priority ?? "medium",
      assigned_to_user_id: input.assigned_to_user_id ?? null,
      assigned_to_name: input.assigned_to_name ?? null,
      notes: String(input.notes ?? "").trim(),
      latest_update: "Created manually",
      raw_payload: { source: "manual" }
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateTrackIncident(
  supabase: SupabaseClient,
  id: string,
  patch: {
    status?: TrackIncidentStatus;
    priority?: TrackIncidentPriority;
    assigned_to_user_id?: string | null;
    assigned_to_name?: string | null;
    notes?: string;
    latest_update?: string | null;
  }
) {
  const updates: Record<string, unknown> = {};
  if (patch.status) {
    updates.status = patch.status;
    updates.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;
  }
  if (patch.priority) updates.priority = patch.priority;
  if (patch.assigned_to_user_id !== undefined) updates.assigned_to_user_id = patch.assigned_to_user_id;
  if (patch.assigned_to_name !== undefined) updates.assigned_to_name = patch.assigned_to_name;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.latest_update !== undefined) updates.latest_update = patch.latest_update;

  const { data, error } = await supabase.from("track_incidents").update(updates).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function listIncidentTypes(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("track_incidents").select("incident_type").limit(5_000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => String(row.incident_type ?? "").trim()).filter(Boolean))].sort();
}
