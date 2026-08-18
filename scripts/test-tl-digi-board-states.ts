import assert from "node:assert/strict";
import { buildTlBoardMedicationRows, buildTlBoardSyncMeta, resolveTlBoardDisplayState } from "../lib/tl-digi-board/board-state";
import {
  didTlBoardRecover,
  nextTlRetryDelayMs,
  planTlBoardRefresh,
  resolveTlCardKind,
  resolveTlHeaderKind
} from "../lib/tl-digi-board/display-state";

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
  assert.equal(retry.force, true);
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

console.log("test-tl-digi-board-states: ok");
