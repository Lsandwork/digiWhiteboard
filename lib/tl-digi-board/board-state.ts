import type {
  TlBoardDisplayState,
  TlBoardMedicationRow,
  TlBoardSyncMeta,
  TlDigiBoardSnapshot,
  TlGingrMedicationRecord,
  TlGingrSourceHealth,
  TlMedicationSummary
} from "./types";
import {
  completedMedicationVisibleInPeriod,
  currentMedicationPeriodAt,
  incompleteMedicationIsOverdue,
  nextMedicationPeriodAt,
  periodLabel
} from "./medication-windows";
import {
  TL_DIGI_BOARD_TIMEZONE,
  TL_GINGR_SYNC_DELAYED_MS,
  TL_GINGR_SYNC_STALE_MS,
  type TlMedicationPeriod
} from "./constants";

export type BuildTlBoardStateInput = {
  medications: TlGingrMedicationRecord[];
  now?: Date;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  syncSucceeded: boolean;
  /** True when get_medication_report_history returned usable admin status for this sync. */
  administrationStatusAvailable?: boolean;
  /** True when Gingr reservation services exposed completion fields this sync. */
  servicesCompletionStatusAvailable?: boolean;
  servicesCompletionAudit?: import("./types").TlAdditionalServicesCompletionAudit | null;
  medicationsHealth?: TlGingrSourceHealth;
  servicesHealth?: TlGingrSourceHealth;
  packageGroupWalksHealth?: TlGingrSourceHealth;
  servicesRemaining?: number;
  packageGroupWalksRemaining?: number;
};

function dedupeMedications(medications: TlGingrMedicationRecord[]): TlGingrMedicationRecord[] {
  const seen = new Map<string, TlGingrMedicationRecord>();
  for (const row of medications) {
    const key = [
      row.gingrMedicationId,
      row.gingrAnimalId,
      row.gingrReservationId ?? "",
      row.serviceDate,
      row.gingrScheduleLabel
    ].join("|");
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

function displayStatusForOpenRow(
  status: TlGingrMedicationRecord["administrationStatus"]
): TlBoardMedicationRow["displayStatus"] {
  if (status === "prepared") return "prepared";
  if (status === "partially_administered") return "partially_administered";
  if (status === "refused" || status === "unable_to_administer") return "refused";
  return "needs_medication";
}

function classifyMedication(row: TlGingrMedicationRecord, now: Date, currentPeriod: TlMedicationPeriod | null): TlBoardMedicationRow | null {
  if (row.administrationStatus === "n_a") {
    return null;
  }

  const complete =
    row.administrationStatus === "administered" || row.administrationStatus === "owner_administered";

  if (complete) {
    if (!completedMedicationVisibleInPeriod(row.scheduleKind, currentPeriod)) {
      return null;
    }
    return {
      ...row,
      displayStatus: "administered",
      evaluatedPeriod: currentPeriod ?? "pm",
      overdueSourcePeriod: null
    };
  }

  const recordedOutcome =
    row.administrationStatus === "refused" || row.administrationStatus === "unable_to_administer";
  const overdue = incompleteMedicationIsOverdue(row.scheduleKind, currentPeriod, now) && !recordedOutcome;

  if (overdue) {
    const overdueSourcePeriod = row.scheduleKind === "other_special" ? null : row.scheduleKind;
    return {
      ...row,
      displayStatus: "overdue",
      evaluatedPeriod: "overdue",
      overdueSourcePeriod
    };
  }

  if (
    row.scheduleKind === "other_special" ||
    row.scheduleKind === currentPeriod ||
    recordedOutcome
  ) {
    return {
      ...row,
      displayStatus: displayStatusForOpenRow(row.administrationStatus),
      evaluatedPeriod: currentPeriod ?? "pm",
      overdueSourcePeriod: null
    };
  }

  return null;
}

export function buildTlBoardMedicationRows(input: BuildTlBoardStateInput): {
  overdue: TlBoardMedicationRow[];
  current: TlBoardMedicationRow[];
  summary: TlMedicationSummary;
} {
  const now = input.now ?? new Date();
  const currentPeriod = currentMedicationPeriodAt(now);
  const deduped = dedupeMedications(input.medications);

  const overdue: TlBoardMedicationRow[] = [];
  const current: TlBoardMedicationRow[] = [];

  for (const row of deduped) {
    const classified = classifyMedication(row, now, currentPeriod);
    if (!classified) continue;
    if (classified.displayStatus === "overdue") overdue.push(classified);
    else current.push(classified);
  }

  const sortRows = (rows: TlBoardMedicationRow[]) =>
    [...rows].sort((a, b) => a.dogName.localeCompare(b.dogName) || a.medicationName.localeCompare(b.medicationName));

  const sortedOverdue = sortRows(overdue);
  const sortedCurrent = sortRows(current);

  const actionable = [
    ...sortedOverdue,
    ...sortedCurrent.filter(
      (r) =>
        r.displayStatus === "needs_medication" ||
        r.displayStatus === "prepared" ||
        r.displayStatus === "partially_administered" ||
        r.displayStatus === "refused" ||
        r.displayStatus === "overdue"
    )
  ];
  const completed = sortedCurrent.filter((r) => r.displayStatus === "administered");

  return {
    overdue: sortedOverdue,
    current: sortedCurrent,
    summary: {
      due: sortedOverdue.length + sortedCurrent.length,
      completed: completed.length,
      remaining: actionable.length,
      overdue: sortedOverdue.length
    }
  };
}

export function buildTlBoardSyncMeta(input: BuildTlBoardStateInput, summary: TlMedicationSummary): TlBoardSyncMeta {
  const now = input.now ?? new Date();
  const currentPeriod = currentMedicationPeriodAt(now);
  const next = nextMedicationPeriodAt(now);

  let gingrSyncHealth: TlBoardSyncMeta["gingrSyncHealth"] = "unknown";
  let isStale = false;

  if (!input.lastSuccessfulSyncAt) {
    gingrSyncHealth = input.syncSucceeded ? "live" : "connection_issue";
    isStale = !input.syncSucceeded;
  } else {
    const ageMs = now.getTime() - new Date(input.lastSuccessfulSyncAt).getTime();
    isStale = ageMs > TL_GINGR_SYNC_STALE_MS;
    if (!input.syncSucceeded) {
      gingrSyncHealth = ageMs > TL_GINGR_SYNC_STALE_MS ? "connection_issue" : "delayed";
    } else if (ageMs > TL_GINGR_SYNC_DELAYED_MS) {
      gingrSyncHealth = "delayed";
    } else {
      gingrSyncHealth = "live";
    }
  }

  const medicationsHealth: TlGingrSourceHealth =
    input.medicationsHealth ??
    (input.syncSucceeded ? "ok" : input.lastSuccessfulSyncAt ? "stale" : "error");
  const servicesHealth: TlGingrSourceHealth = input.servicesHealth ?? medicationsHealth;
  const packageGroupWalksHealth: TlGingrSourceHealth =
    input.packageGroupWalksHealth ?? "unevaluated";

  const medicationsAllClear =
    medicationsHealth === "ok" &&
    summary.due === 0 &&
    summary.remaining === 0 &&
    summary.overdue === 0 &&
    !isStale;
  const servicesAllClear = servicesHealth === "ok" && (input.servicesRemaining ?? 0) === 0 && !isStale;
  const packageGroupWalksAllClear =
    packageGroupWalksHealth === "ok" && (input.packageGroupWalksRemaining ?? 0) === 0 && !isStale;
  const allClear = medicationsAllClear && servicesAllClear;

  const boardState = resolveTlBoardDisplayState({
    medicationsHealth,
    servicesHealth,
    gingrSyncHealth,
    isStale,
    medicationsAllClear,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt
  });

  return {
    timezone: TL_DIGI_BOARD_TIMEZONE,
    currentPeriod,
    gingrSyncHealth,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    lastAttemptAt: input.lastAttemptAt ?? null,
    lastError: input.lastError ?? null,
    isStale,
    allClear,
    medicationsHealth,
    servicesHealth,
    packageGroupWalksHealth,
    medicationsAllClear,
    servicesAllClear,
    packageGroupWalksAllClear,
    boardState,
    nextPeriod: next?.period ?? null,
    nextPeriodStartsAt: next ? `${periodLabel(next.period)} • ${next.startsAtLa}` : null,
    administrationStatusAvailable: Boolean(input.administrationStatusAvailable),
    servicesCompletionStatusAvailable: Boolean(input.servicesCompletionStatusAvailable),
    servicesCompletionAudit: input.servicesCompletionAudit ?? null
  };
}

export function resolveTlBoardDisplayState(input: {
  medicationsHealth: TlGingrSourceHealth;
  servicesHealth: TlGingrSourceHealth;
  gingrSyncHealth: TlBoardSyncMeta["gingrSyncHealth"];
  isStale: boolean;
  medicationsAllClear: boolean;
  lastSuccessfulSyncAt: string | null;
}): TlBoardDisplayState {
  const meds = input.medicationsHealth;
  const services = input.servicesHealth;
  if (meds === "unevaluated" && services === "unevaluated") return "INITIAL_LOADING";
  if (meds === "error" && services === "error" && !input.lastSuccessfulSyncAt) return "CONNECTION_ERROR";
  if ((meds === "error" && services === "ok") || (meds === "ok" && services === "error")) {
    return "PARTIAL_DATA_ERROR";
  }
  if (meds === "error" || services === "error") return "CONNECTION_ERROR";
  if (meds === "stale" || services === "stale" || input.isStale || input.gingrSyncHealth === "connection_issue") {
    return "STALE";
  }
  if (input.medicationsAllClear && services === "ok") return "EMPTY_VALID";
  return "LIVE";
}

const EMPTY_SERVICES_SUMMARY = {
  due: 0,
  completed: 0,
  remaining: 0,
  knownIncomplete: 0,
  completionUnknown: 0
} as const;

const EMPTY_PACKAGE_GROUP_WALKS_SUMMARY = {
  eligible: 0,
  remaining: 0,
  completed: 0
} as const;

/** Rebuild current/overdue rows and period from stored medications at `now`. */
export function rehydrateTlBoardSnapshot(snapshot: TlDigiBoardSnapshot, now: Date): TlDigiBoardSnapshot {
  const syncSucceeded = snapshot.meta.medicationsHealth === "ok";
  const input: BuildTlBoardStateInput = {
    medications: snapshot.medications,
    now,
    lastSuccessfulSyncAt: snapshot.meta.lastSuccessfulSyncAt,
    lastAttemptAt: snapshot.meta.lastAttemptAt,
    lastError: snapshot.meta.lastError,
    syncSucceeded,
    administrationStatusAvailable: snapshot.meta.administrationStatusAvailable,
    servicesCompletionStatusAvailable: snapshot.meta.servicesCompletionStatusAvailable,
    servicesCompletionAudit: snapshot.meta.servicesCompletionAudit,
    medicationsHealth: snapshot.meta.medicationsHealth,
    servicesHealth: snapshot.meta.servicesHealth,
    packageGroupWalksHealth: snapshot.meta.packageGroupWalksHealth,
    servicesRemaining: snapshot.servicesSummary.remaining,
    packageGroupWalksRemaining: snapshot.packageGroupWalksSummary?.remaining ?? 0
  };
  const built = buildTlBoardMedicationRows(input);
  const meta = buildTlBoardSyncMeta(input, built.summary);
  return {
    overdue: built.overdue,
    current: built.current,
    summary: built.summary,
    additionalServices: snapshot.additionalServices,
    servicesSummary: snapshot.servicesSummary,
    packageGroupWalks: snapshot.packageGroupWalks ?? [],
    packageGroupWalksSummary: snapshot.packageGroupWalksSummary ?? { ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY },
    meta,
    medications: snapshot.medications,
    generatedAt: snapshot.generatedAt
  };
}

/**
 * First-sync / missing-snapshot payload. Period comes from the clock so the TV
 * never shows a blank period. All Clear is never true.
 */
export function buildUnavailableTlBoardSnapshot(now: Date, lastError: string): TlDigiBoardSnapshot {
  const attemptedAt = now.toISOString();
  const input: BuildTlBoardStateInput = {
    medications: [],
    now,
    lastSuccessfulSyncAt: null,
    lastAttemptAt: attemptedAt,
    lastError,
    syncSucceeded: false,
    medicationsHealth: "error",
    servicesHealth: "error",
    packageGroupWalksHealth: "error",
    servicesRemaining: 0,
    packageGroupWalksRemaining: 0
  };
  const built = buildTlBoardMedicationRows(input);
  const meta = buildTlBoardSyncMeta(input, built.summary);
  return {
    overdue: [],
    current: [],
    summary: built.summary,
    additionalServices: [],
    servicesSummary: { ...EMPTY_SERVICES_SUMMARY },
    packageGroupWalks: [],
    packageGroupWalksSummary: { ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY },
    meta,
    medications: [],
    generatedAt: attemptedAt
  };
}

export function tlBoardSnapshotNeedsBackgroundSync(
  snapshot: TlDigiBoardSnapshot | null,
  now: Date,
  options?: { forceRefresh?: boolean }
): boolean {
  if (options?.forceRefresh) return true;
  if (!snapshot) return true;
  if (!snapshot.meta.lastSuccessfulSyncAt) return true;
  if (snapshot.meta.medicationsHealth === "error" || snapshot.meta.servicesHealth === "error") return true;
  if (snapshot.meta.boardState === "CONNECTION_ERROR" || snapshot.meta.boardState === "PARTIAL_DATA_ERROR") {
    return true;
  }
  const ageMs = now.getTime() - new Date(snapshot.meta.lastSuccessfulSyncAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return true;
  return ageMs > TL_GINGR_SYNC_DELAYED_MS;
}
