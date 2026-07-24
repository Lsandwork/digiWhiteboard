export type TrackIncidentSource = "gingr" | "manual";
export type TrackIncidentStatus = "new" | "in_progress" | "follow_up_needed" | "resolved";
export type TrackIncidentPriority = "high" | "medium" | "low";
export type TrackIncidentSyncTrigger = "cron" | "manual" | "webhook";

export type TrackIncident = {
  id: string;
  incident_number: string;
  gingr_incident_id: string | null;
  occurred_at: string | null;
  source: TrackIncidentSource;
  dog_name: string;
  dog_breed: string | null;
  gingr_animal_id: string | null;
  owner_name: string;
  gingr_owner_id: string | null;
  incident_type: string;
  incident_type_id: string | null;
  reported_by: string;
  reported_by_username: string | null;
  status: TrackIncidentStatus;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  priority: TrackIncidentPriority;
  location_name: string | null;
  location_id: string | null;
  notes: string;
  latest_update: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type TrackIncidentSyncRun = {
  id: string;
  trigger: TrackIncidentSyncTrigger;
  status: "running" | "completed" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  message: string | null;
};

export type TrackIncidentSummary = {
  total: number;
  inProgress: number;
  resolved: number;
  newToday: number;
};

export type TrackIncidentListFilters = {
  q?: string;
  status?: TrackIncidentStatus | "all";
  source?: TrackIncidentSource | "all";
  incidentType?: string | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};
