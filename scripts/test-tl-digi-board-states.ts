import assert from "node:assert/strict";
import {
  buildTlBoardMedicationRows,
  buildTlBoardSyncMeta,
  buildUnavailableTlBoardSnapshot,
  rehydrateTlBoardSnapshot,
  resolveTlBoardDisplayState,
  tlBoardSnapshotNeedsBackgroundSync
} from "../lib/tl-digi-board/board-state";
import { DEFAULT_TL_DIGI_BOARD_CONFIG } from "../lib/tl-digi-board/config";
import {
  didTlBoardRecover,
  headerLabelForKind,
  headerLastSyncText,
  headerPeriodText,
  mergeTlBoardClientPayload,
  nextTlRetryDelayMs,
  planTlBoardRefresh,
  resolveTlCardKind,
  resolveTlHeaderKind
} from "../lib/tl-digi-board/display-state";
import { dateAtLaLocal } from "../lib/tl-digi-board/medication-windows";
import { assembleTlDigiBoardPublicPayload } from "../lib/tl-digi-board/server";
import type { TlDigiBoardSnapshot, TlGingrMedicationRecord } from "../lib/tl-digi-board/types";

function emptySummary() {
  return { due: 0, completed: 0, remaining: 0, overdue: 0 };
}

// TEST 3 — initial request pending: Checking Gingr, never All Clear.
{
  const card = resolveTlCardKind({
    phase: "initial",
    health: "unevaluated",
    allClear: false,
    hasRows: false
  });
  const header = resolveTlHeaderKind({
    phase: "initial",
    boardState: "INITIAL_LOADING",
    gingrSyncHealth: "unknown"
  });
  assert.equal(card, "checking");
  assert.equal(header, "syncing");
  assert.notEqual(card, "all_clear");
}

// TEST 2 — successful Gingr response with zero medications/services.
{
  const rows = buildTlBoardMedicationRows({
    medications: [],
    now: new Date("2026-08-18T20:00:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-18T20:00:00.000Z",
    syncSucceeded: true,
    medicationsHealth: "ok",
    servicesHealth: "ok",
    servicesRemaining: 0
  });
  const meta = buildTlBoardSyncMeta(
    {
      medications: [],
      now: new Date("2026-08-18T20:00:00.000Z"),
      lastSuccessfulSyncAt: "2026-08-18T20:00:00.000Z",
      lastAttemptAt: "2026-08-18T20:00:00.000Z",
      lastError: null,
      syncSucceeded: true,
      medicationsHealth: "ok",
      servicesHealth: "ok",
      servicesRemaining: 0
    },
    rows.summary
  );
  assert.equal(meta.medicationsHealth, "ok");
  assert.equal(meta.servicesHealth, "ok");
  assert.equal(meta.medicationsAllClear, true);
  assert.equal(meta.servicesAllClear, true);
  assert.equal(meta.allClear, true);
  assert.equal(meta.boardState, "EMPTY_VALID");
  assert.equal(
    resolveTlCardKind({
      phase: "resolved",
      health: meta.medicationsHealth,
      allClear: meta.medicationsAllClear,
      hasRows: false
    }),
    "all_clear"
  );
}

// TEST 1 — Gingr offline: no All Clear, connection error, last successful sync preserved, retry scheduled.
{
  const meta = buildTlBoardSyncMeta(
    {
      medications: [],
      now: new Date("2026-08-18T20:05:00.000Z"),
      lastSuccessfulSyncAt: "2026-08-18T19:58:00.000Z",
      lastAttemptAt: "2026-08-18T20:05:00.000Z",
      lastError: "Gingr timeout",
      syncSucceeded: false,
      medicationsHealth: "error",
      servicesHealth: "error",
      servicesRemaining: 0
    },
    emptySummary()
  );
  assert.equal(meta.medicationsAllClear, false);
  assert.equal(meta.servicesAllClear, false);
  assert.equal(meta.allClear, false);
  assert.equal(meta.boardState, "CONNECTION_ERROR");
  assert.equal(meta.lastSuccessfulSyncAt, "2026-08-18T19:58:00.000Z");
  assert.equal(
    resolveTlCardKind({
      phase: "resolved",
      health: "error",
      allClear: false,
      hasRows: false
    }),
    "error"
  );
  assert.equal(
    resolveTlHeaderKind({
      phase: "resolved",
      boardState: "CONNECTION_ERROR",
      gingrSyncHealth: "connection_issue"
    }),
    "issue"
  );
  const retry = planTlBoardRefresh({ consecutiveFailures: 1, boardState: "CONNECTION_ERROR" });
  assert.equal(retry.force, false);
  assert.equal(retry.delayMs, nextTlRetryDelayMs(0));
  assert.equal(nextTlRetryDelayMs(0), 10_000);
  assert.equal(nextTlRetryDelayMs(1), 20_000);
  assert.equal(nextTlRetryDelayMs(2), 30_000);
  assert.equal(nextTlRetryDelayMs(3), 60_000);
  assert.equal(nextTlRetryDelayMs(9), 60_000);
}

// Failed request with zero data is not a successful empty board.
{
  const failedEmpty = buildTlBoardSyncMeta(
    {
      medications: [],
      now: new Date("2026-08-18T20:00:00.000Z"),
      lastSuccessfulSyncAt: null,
      syncSucceeded: false,
      medicationsHealth: "error",
      servicesHealth: "error",
      servicesRemaining: 0
    },
    emptySummary()
  );
  const successEmpty = buildTlBoardSyncMeta(
    {
      medications: [],
      now: new Date("2026-08-18T20:00:00.000Z"),
      lastSuccessfulSyncAt: "2026-08-18T20:00:00.000Z",
      syncSucceeded: true,
      medicationsHealth: "ok",
      servicesHealth: "ok",
      servicesRemaining: 0
    },
    emptySummary()
  );
  assert.equal(failedEmpty.boardState, "CONNECTION_ERROR");
  assert.equal(failedEmpty.allClear, false);
  assert.equal(successEmpty.boardState, "EMPTY_VALID");
  assert.equal(successEmpty.allClear, true);
}

// TEST 4 — Gingr reconnects: board returns to LIVE without a page reload.
{
  assert.equal(
    didTlBoardRecover({ previousState: "CONNECTION_ERROR", nextState: "LIVE" }),
    true
  );
  assert.equal(
    didTlBoardRecover({ previousState: "CONNECTION_ERROR", nextState: "EMPTY_VALID" }),
    true
  );
  assert.equal(
    didTlBoardRecover({ previousState: "LIVE", nextState: "LIVE" }),
    false
  );
  const recovered = planTlBoardRefresh({ consecutiveFailures: 0, boardState: "LIVE" });
  assert.equal(recovered.force, false);
}

assert.equal(
  resolveTlBoardDisplayState({
    medicationsHealth: "ok",
    servicesHealth: "error",
    gingrSyncHealth: "live",
    isStale: false,
    medicationsAllClear: true,
    lastSuccessfulSyncAt: "2026-08-18T20:00:00.000Z"
  }),
  "PARTIAL_DATA_ERROR"
);

// Resolved fetch with no payload/health is an error, never All Clear.
{
  const card = resolveTlCardKind({
    phase: "resolved",
    health: undefined,
    allClear: false,
    hasRows: false
  });
  assert.equal(card, "error");
  assert.notEqual(card, "all_clear");
}

function sampleMed(partial: Partial<TlGingrMedicationRecord> = {}): TlGingrMedicationRecord {
  return {
    gingrMedicationId: "med-1",
    gingrAnimalId: "animal-1",
    gingrReservationId: "res-1",
    dogName: "Charlie",
    photoUrl: null,
    lodgingLabel: "SUITE • 4",
    lodgingAreaKey: "suite",
    lodgingRunName: "Suite 4",
    gingrScheduleLabel: "PM",
    scheduleKind: "pm",
    medicationName: "Amoxicillin",
    dosage: "1 tablet",
    instructions: "Give with dinner",
    notes: null,
    administrationStatus: "not_administered",
    administeredAt: null,
    administeredBy: null,
    serviceDate: "2026-08-18",
    ...partial
  };
}

function sampleSnapshot(nowIso: string, medications: TlGingrMedicationRecord[]): TlDigiBoardSnapshot {
  const now = new Date(nowIso);
  const built = buildTlBoardMedicationRows({
    medications,
    now,
    lastSuccessfulSyncAt: nowIso,
    lastAttemptAt: nowIso,
    lastError: null,
    syncSucceeded: true,
    medicationsHealth: "ok",
    servicesHealth: "ok",
    servicesRemaining: 0
  });
  const meta = buildTlBoardSyncMeta(
    {
      medications,
      now,
      lastSuccessfulSyncAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: null,
      syncSucceeded: true,
      medicationsHealth: "ok",
      servicesHealth: "ok",
      servicesRemaining: 0
    },
    built.summary
  );
  return {
    overdue: built.overdue,
    current: built.current,
    summary: built.summary,
    additionalServices: [],
    servicesSummary: { due: 0, completed: 0, remaining: 0, knownIncomplete: 0, completionUnknown: 0 },
    meta,
    medications,
    generatedAt: nowIso
  };
}

// Missing snapshot: period is still computed, All Clear is never true, background sync required.
{
  const now = dateAtLaLocal({ year: 2026, month: 8, day: 18, hour: 17, minute: 0, second: 0 });
  const unavailable = buildUnavailableTlBoardSnapshot(now, "No Gingr snapshot is stored yet.");
  assert.equal(unavailable.meta.currentPeriod, "pm");
  assert.equal(unavailable.meta.medicationsAllClear, false);
  assert.equal(unavailable.meta.servicesAllClear, false);
  assert.equal(unavailable.meta.allClear, false);
  assert.equal(unavailable.meta.boardState, "CONNECTION_ERROR");
  assert.equal(tlBoardSnapshotNeedsBackgroundSync(null, now), true);

  const assembled = assembleTlDigiBoardPublicPayload({
    config: DEFAULT_TL_DIGI_BOARD_CONFIG,
    snapshot: null,
    reminders: [{ id: "r1", title: "Close Dens", message: "Check dens", scheduledTime: "5:00 PM" }],
    now
  });
  assert.equal(assembled.needsBackgroundSync, true);
  assert.equal(assembled.payload.meta.allClear, false);
  assert.equal(assembled.payload.meta.medicationsAllClear, false);
  assert.equal(assembled.payload.meta.boardState, "CONNECTION_ERROR");
  assert.equal(assembled.payload.meta.currentPeriod, "pm");
  assert.equal(assembled.payload.reminders.length, 1);
  assert.equal(assembled.payload.config.displayTitle, "Team Lead Alerts + Reminders");
}

// Cached snapshot rehydrates the current LA period from stored medications without calling Gingr.
{
  const morning = dateAtLaLocal({ year: 2026, month: 8, day: 18, hour: 8, minute: 0, second: 0 });
  const evening = dateAtLaLocal({ year: 2026, month: 8, day: 18, hour: 17, minute: 0, second: 0 });
  const snapshot = sampleSnapshot(morning.toISOString(), [
    sampleMed({ gingrScheduleLabel: "AM", scheduleKind: "am" }),
    sampleMed({ gingrMedicationId: "med-2", gingrScheduleLabel: "PM", scheduleKind: "pm" })
  ]);
  assert.equal(snapshot.meta.currentPeriod, "am");

  const rehydrated = rehydrateTlBoardSnapshot(snapshot, evening);
  assert.equal(rehydrated.meta.currentPeriod, "pm");
  assert.equal(rehydrated.meta.lastSuccessfulSyncAt, snapshot.meta.lastSuccessfulSyncAt);
  assert.ok(rehydrated.current.some((row) => row.scheduleKind === "pm"));

  const assembled = assembleTlDigiBoardPublicPayload({
    config: DEFAULT_TL_DIGI_BOARD_CONFIG,
    snapshot,
    reminders: [],
    now: evening
  });
  assert.equal(assembled.payload.meta.currentPeriod, "pm");
  assert.equal(assembled.needsBackgroundSync, true);
}

// Fresh successful snapshot does not need a background Gingr pull.
{
  const now = new Date("2026-08-18T20:00:10.000Z");
  const snapshot = sampleSnapshot("2026-08-18T20:00:00.000Z", []);
  assert.equal(tlBoardSnapshotNeedsBackgroundSync(snapshot, now), false);
  const forced = tlBoardSnapshotNeedsBackgroundSync(snapshot, now, { forceRefresh: true });
  assert.equal(forced, true);
}

// Header: never treat a missing payload as CONNECTION ISSUE, and never blank Period at 5pm.
{
  assert.equal(
    resolveTlHeaderKind({
      phase: "initial",
      boardState: undefined,
      gingrSyncHealth: undefined
    }),
    "syncing"
  );
  assert.equal(headerLabelForKind("syncing"), "Syncing with Gingr…");
  assert.notEqual(headerLabelForKind("syncing"), "⚠ GINGR CONNECTION ISSUE");
  assert.equal(headerPeriodText(null, "pm"), "PM");
  assert.equal(headerPeriodText(undefined, "pm"), "PM");
  assert.equal(headerPeriodText("am", "pm"), "AM");
  assert.equal(headerLastSyncText({ phase: "initial", formattedSuccess: null }), "Checking…");
  assert.equal(headerLastSyncText({ phase: "resolved", formattedSuccess: null }), "Never");
  assert.equal(headerLastSyncText({ phase: "resolved", formattedSuccess: "4:59 PM" }), "4:59 PM");
}

// Rows beat an error health flag — never hide known medications behind "Unable to verify".
{
  assert.equal(
    resolveTlCardKind({
      phase: "resolved",
      health: "error",
      allClear: false,
      hasRows: true
    }),
    "stale"
  );
}

{
  const previous = {
    medications: [{ id: "1" }],
    overdue: [{ id: "1" }],
    current: [],
    additionalServices: [],
    meta: {
      lastSuccessfulSyncAt: "2026-08-19T19:35:47.774Z",
      boardState: "LIVE",
      medicationsHealth: "ok"
    }
  };
  const incoming = {
    medications: [],
    overdue: [],
    current: [],
    additionalServices: [],
    meta: {
      lastSuccessfulSyncAt: null,
      lastError: "No Gingr snapshot is stored yet. Background sync will retry automatically.",
      boardState: "CONNECTION_ERROR",
      medicationsHealth: "error"
    }
  };
  const merged = mergeTlBoardClientPayload(previous, incoming);
  assert.equal(merged.meta?.boardState, "STALE");
  assert.equal((merged.overdue as unknown[]).length, 1);
  assert.equal(merged.meta?.lastSuccessfulSyncAt, "2026-08-19T19:35:47.774Z");
}

// All administered for the period: due > 0 but remaining = 0 must be All Clear, not an error card.
{
  const now = dateAtLaLocal({ year: 2026, month: 8, day: 20, hour: 9, minute: 17, second: 0 });
  const snapshot = sampleSnapshot(now.toISOString(), [
    sampleMed({
      gingrScheduleLabel: "AM",
      scheduleKind: "am",
      administrationStatus: "administered"
    }),
    sampleMed({
      gingrMedicationId: "med-2",
      gingrAnimalId: "animal-2",
      dogName: "Wilco",
      gingrScheduleLabel: "AM",
      scheduleKind: "am",
      administrationStatus: "administered"
    })
  ]);
  assert.equal(snapshot.summary.remaining, 0);
  assert.ok(snapshot.summary.due > 0);
  assert.equal(snapshot.meta.medicationsAllClear, true);
  assert.equal(
    resolveTlCardKind({
      phase: "resolved",
      health: snapshot.meta.medicationsHealth,
      allClear: snapshot.meta.medicationsAllClear,
      hasRows: false
    }),
    "all_clear"
  );
}

console.log("test-tl-digi-board-states: ok");
