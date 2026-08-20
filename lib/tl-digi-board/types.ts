import type { TlLodgingAreaKey, TlMedicationPeriod } from "./constants";
import type {
  TlBoardPackageGroupWalkRow,
  TlBoardPackageGroupWalksSummary
} from "@/lib/package-group-walks/types";

export type { TlBoardPackageGroupWalkRow, TlBoardPackageGroupWalksSummary };

/**
 * Authoritative Gingr Medication Report statuses.
 * Labels come from Gingr’s report UI: Administered, N/A, Prepared, Refused,
 * Partially Administered, Owner Administered, plus Not Administered / Unable.
 */
export type TlGingrAdministrationStatus =
  | "not_administered"
  | "administered"
  | "owner_administered"
  | "partially_administered"
  | "prepared"
  | "refused"
  | "n_a"
  | "unable_to_administer";

export type TlMedicationScheduleKind = TlMedicationPeriod | "other_special";

export type TlMedicationDisplayStatus =
  | "needs_medication"
  | "administered"
  | "overdue"
  | "not_current_period"
  | "prepared"
  | "refused"
  | "partially_administered";

export type TlGingrMedicationRecord = {
  /** Stable Gingr medication record identifier when available. */
  gingrMedicationId: string;
  gingrAnimalId: string;
  gingrReservationId: string | null;
  dogName: string;
  photoUrl: string | null;
  lodgingLabel: string | null;
  lodgingAreaKey: TlLodgingAreaKey | null;
  lodgingRunName: string | null;
  /** Raw schedule label from Gingr (e.g. "Pill Box", "AM"). */
  gingrScheduleLabel: string;
  scheduleKind: TlMedicationScheduleKind;
  medicationName: string;
  dosage: string | null;
  instructions: string | null;
  notes: string | null;
  administrationStatus: TlGingrAdministrationStatus;
  /** Raw Gingr Medication Report status label when history synced. */
  gingrReportStatusLabel?: string | null;
  administeredAt: string | null;
  administeredBy: string | null;
  /** LA calendar date this row applies to (YYYY-MM-DD). */
  serviceDate: string;
};

export type TlBoardMedicationRow = TlGingrMedicationRecord & {
  displayStatus: TlMedicationDisplayStatus;
  /** Period this row is currently evaluated against (current or overdue source period). */
  evaluatedPeriod: TlMedicationPeriod | "overdue";
  overdueSourcePeriod: TlMedicationPeriod | null;
};

export type TlMedicationSummary = {
  due: number;
  completed: number;
  remaining: number;
  overdue: number;
};

export type TlAdditionalServiceDisplayStatus = "needs_completion" | "completion_unknown";

export type TlBoardAdditionalServiceRow = {
  id: string;
  gingrServiceId: string;
  gingrReservationId: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  lodgingLabel: string | null;
  serviceName: string;
  scheduledAt: string | null;
  displayStatus: TlAdditionalServiceDisplayStatus;
  /** Gingr completion resolution metadata for audits. */
  completionState: "complete" | "incomplete" | "unknown";
  completionReliable: boolean;
  completionSource: string;
  serviceDate: string;
};

export type TlAdditionalServicesSummary = {
  due: number;
  completed: number;
  remaining: number;
  /** Known incomplete (excludes completion_unknown). */
  knownIncomplete: number;
  completionUnknown: number;
};

export type TlServiceTypeAuditRow = {
  serviceType: string;
  status: "pass" | "not_scheduled_today" | "fail";
  scheduledToday: number;
  reliable: number;
  unreliable: number;
  complete: number;
  incomplete: number;
  unknown: number;
  unknownSamples: string[];
};

export type TlAdditionalServicesCompletionAudit = {
  auditedAt: string;
  serviceDate: string;
  reservationCount: number;
  allReliable: boolean;
  allRequiredTypesPass: boolean;
  perType: TlServiceTypeAuditRow[];
  issues: string[];
  completionSource: string;
  documentationPath: string;
};

export type TlGingrSyncHealth = "live" | "delayed" | "connection_issue" | "unknown";

/** Independent Gingr source outcome — empty arrays are not proof of a successful zero-item response. */
export type TlGingrSourceHealth = "unevaluated" | "ok" | "stale" | "error";

/**
 * Explicit TV board states. Never derive "all clear" from missing/failed data.
 * INITIAL_LOADING is client-only (no payload yet).
 */
export type TlBoardDisplayState =
  | "INITIAL_LOADING"
  | "LIVE"
  | "STALE"
  | "CONNECTION_ERROR"
  | "EMPTY_VALID"
  | "PARTIAL_DATA_ERROR";

export type TlBoardSyncMeta = {
  timezone: "America/Los_Angeles";
  currentPeriod: TlMedicationPeriod | null;
  gingrSyncHealth: TlGingrSyncHealth;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  isStale: boolean;
  allClear: boolean;
  medicationsHealth: TlGingrSourceHealth;
  servicesHealth: TlGingrSourceHealth;
  /** Independent from meds/services so one failing card cannot blank the others. */
  packageGroupWalksHealth: TlGingrSourceHealth;
  medicationsAllClear: boolean;
  servicesAllClear: boolean;
  packageGroupWalksAllClear: boolean;
  boardState: TlBoardDisplayState;
  nextPeriod: TlMedicationPeriod | null;
  nextPeriodStartsAt: string | null;
  /**
   * True when this snapshot merged administration status from
   * GET /api/v1/get_medication_report_history (Gingr Medication Report).
   */
  administrationStatusAvailable: boolean;
  /** True when every scheduled TL service row exposed reliable Gingr completion fields. */
  servicesCompletionStatusAvailable: boolean;
  servicesCompletionAudit: TlAdditionalServicesCompletionAudit | null;
};

/** Persisted / returned TL Digi Board state after a Gingr medication sync. */
export type TlDigiBoardSnapshot = {
  overdue: TlBoardMedicationRow[];
  current: TlBoardMedicationRow[];
  summary: TlMedicationSummary;
  additionalServices: TlBoardAdditionalServiceRow[];
  servicesSummary: TlAdditionalServicesSummary;
  /** Checked-in dogs with an eligible package still owed today's group walk. */
  packageGroupWalks: TlBoardPackageGroupWalkRow[];
  packageGroupWalksSummary: TlBoardPackageGroupWalksSummary;
  meta: TlBoardSyncMeta;
  /** Last-known-good raw medication records — retained across failed syncs. */
  medications: TlGingrMedicationRecord[];
  generatedAt: string;
};

/** Public TV payload — snapshot plus safe config fields (never secrets). */
export type TlDigiBoardPublicPayload = TlDigiBoardSnapshot & {
  config: {
    displayTitle: string;
    enabled: boolean;
  };
  reminders: Array<{
    id: string;
    title: string;
    message: string;
    scheduledTime: string;
  }>;
};
