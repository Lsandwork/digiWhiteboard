/** RuffOps System Health & Debugging — shared types. */

export type HealthStatus = "HEALTHY" | "WARNING" | "DEGRADED" | "FAILED" | "UNKNOWN";

export type EventSeverity = "debug" | "info" | "warning" | "error" | "critical";

export type EventCategory =
  | "user_activity"
  | "route"
  | "integration"
  | "api"
  | "error"
  | "job"
  | "system"
  | "debug";

export type PipelineStageStatus = "PASS" | "WARNING" | "FAIL" | "SKIPPED";

export type QualityGate = "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "UNKNOWN";

export type RouteAuditStatus = "running" | "passed" | "warning" | "failed";

export type PipelineStage = {
  stage: number;
  key: string;
  label: string;
  status: PipelineStageStatus;
  durationMs?: number | null;
  detail?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type DogDecisionStep = {
  step: string;
  status: PipelineStageStatus | string;
  detail?: string | null;
  at?: string | null;
};

export type DogDecisionTrace = {
  dogName: string | null;
  dogId: string | null;
  reservationId: string | null;
  source: string;
  serviceCanonical: string | null;
  serviceRaw: string | null;
  direction: string | null;
  pickupRequested: string | null;
  dropoffRequested: string | null;
  pickupNormalized: string | null;
  dropoffNormalized: string | null;
  eligibility: string;
  routeVanKey: string | null;
  routeName: string | null;
  generatedDestination: string | null;
  expectedDestination: string | null;
  validationStatus: string;
  errorCode: string | null;
  decisionTrace: DogDecisionStep[];
  metadata?: Record<string, unknown>;
};

export type MissingDogRecord = {
  dog: string;
  dogId?: string | null;
  stage: string;
  reason: string;
  reservationId?: string | null;
  direction?: string | null;
};

export type DestinationMismatch = {
  dog: string;
  dogId?: string | null;
  expected: string;
  actual: string;
  direction?: string | null;
  stage?: string;
};

export type SystemHealthEventInput = {
  eventType: string;
  eventCategory?: EventCategory;
  severity?: EventSeverity;
  occurredAt?: string | Date;
  userId?: string | null;
  userEmail?: string | null;
  role?: string | null;
  module?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  integration?: string | null;
  status?: string | null;
  durationMs?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
};

export type CaptureErrorInput = {
  error: unknown;
  severity?: EventSeverity;
  module?: string | null;
  page?: string | null;
  endpoint?: string | null;
  userId?: string | null;
  role?: string | null;
  browser?: string | null;
  device?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  affectedOperation?: string | null;
  context?: Record<string, unknown>;
};

export const ROUTE_PIPELINE_STAGES: Array<{ key: string; label: string }> = [
  { key: "gingr_fetch", label: "Gingr Fetch" },
  { key: "normalize", label: "Normalize" },
  { key: "service_classification", label: "Service Classification" },
  { key: "eligibility", label: "Eligibility" },
  { key: "pickup_resolution", label: "Pickup Resolution" },
  { key: "dropoff_resolution", label: "Dropoff Resolution" },
  { key: "geocoding", label: "Geocoding" },
  { key: "grouping", label: "Grouping" },
  { key: "capacity_assignment", label: "Capacity Assignment" },
  { key: "route_assignment", label: "Route Assignment" },
  { key: "route_optimization", label: "Route Optimization" },
  { key: "validation", label: "Validation" },
  { key: "owner_communication", label: "Owner Communication Preparation" },
  { key: "samsara_export_prep", label: "Samsara Export Preparation" },
  { key: "final_approval", label: "Final Approval" },
  { key: "export", label: "Export" }
];
