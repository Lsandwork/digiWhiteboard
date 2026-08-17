import type { TlBoardMedicationRow, TlBoardSyncMeta, TlGingrMedicationRecord, TlMedicationSummary } from "./types";
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

function classifyMedication(row: TlGingrMedicationRecord, now: Date, currentPeriod: TlMedicationPeriod | null): TlBoardMedicationRow | null {
  const administered = row.administrationStatus === "administered";

  if (incompleteMedicationIsOverdue(row.scheduleKind, currentPeriod, now) && !administered) {
    const overdueSourcePeriod = row.scheduleKind === "other_special" ? null : row.scheduleKind;
    return {
      ...row,
      displayStatus: "overdue",
      evaluatedPeriod: "overdue",
      overdueSourcePeriod
    };
  }

  if (administered) {
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

  if (row.scheduleKind === "other_special" || row.scheduleKind === currentPeriod) {
    return {
      ...row,
      displayStatus: "needs_medication",
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

  const actionable = [...sortedOverdue, ...sortedCurrent.filter((r) => r.displayStatus === "needs_medication")];
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

  const allClear =
    input.syncSucceeded &&
    summary.due === 0 &&
    summary.remaining === 0 &&
    summary.overdue === 0 &&
    !isStale;

  return {
    timezone: TL_DIGI_BOARD_TIMEZONE,
    currentPeriod,
    gingrSyncHealth,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    lastAttemptAt: input.lastAttemptAt ?? null,
    lastError: input.lastError ?? null,
    isStale,
    allClear,
    nextPeriod: next?.period ?? null,
    nextPeriodStartsAt: next ? `${periodLabel(next.period)} • ${next.startsAtLa}` : null,
    administrationStatusAvailable: Boolean(input.administrationStatusAvailable),
    servicesCompletionStatusAvailable: Boolean(input.servicesCompletionStatusAvailable),
    servicesCompletionAudit: input.servicesCompletionAudit ?? null
  };
}
