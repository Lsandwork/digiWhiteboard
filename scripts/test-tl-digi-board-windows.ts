import assert from "node:assert/strict";
import { buildTlBoardMedicationRows, buildTlBoardSyncMeta } from "../lib/tl-digi-board/board-state";
import {
  currentMedicationPeriodAt,
  dateAtLaLocal,
  incompleteMedicationIsOverdue,
  normalizeScheduleLabel
} from "../lib/tl-digi-board/medication-windows";
import type { TlGingrMedicationRecord } from "../lib/tl-digi-board/types";

function med(partial: Partial<TlGingrMedicationRecord> & Pick<TlGingrMedicationRecord, "gingrMedicationId">): TlGingrMedicationRecord {
  return {
    gingrAnimalId: "animal-1",
    gingrReservationId: "res-1",
    dogName: "Charlie",
    photoUrl: null,
    lodgingLabel: "SUITE • 4",
    lodgingAreaKey: "suite",
    lodgingRunName: "Suite 4",
    gingrScheduleLabel: "AM",
    scheduleKind: "am",
    medicationName: "Amoxicillin",
    dosage: "1 tablet",
    instructions: "Give with breakfast",
    notes: null,
    administrationStatus: "not_administered",
    administeredAt: null,
    administeredBy: null,
    serviceDate: "2026-08-17",
    ...partial
  };
}

const aug17_035959 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 3, minute: 59, second: 59 });
const aug17_040000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 4, minute: 0, second: 0 });
const aug17_080000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 8 });
const aug17_095959 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 9, minute: 59, second: 59 });
const aug17_100000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 10, minute: 0, second: 0 });
const aug17_120000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 12 });
const aug17_120300 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 12, minute: 3 });
const aug17_140000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 14 });
const aug17_141400 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 14, minute: 14 });
const aug17_141500 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 14, minute: 15 });
const aug17_155959 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 15, minute: 59, second: 59 });
const aug17_160000 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 16, minute: 0, second: 0 });
const aug17_235959 = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 23, minute: 59, second: 59 });
const aug18_000000 = dateAtLaLocal({ year: 2026, month: 8, day: 18, hour: 0, minute: 0, second: 0 });

assert.equal(currentMedicationPeriodAt(aug17_035959), null, "before 4 AM has no current period");
assert.equal(currentMedicationPeriodAt(aug17_040000), "am", "AM starts at 4:00 AM LA");
assert.equal(currentMedicationPeriodAt(aug17_095959), "am", "still AM at 9:59:59 AM");
assert.equal(currentMedicationPeriodAt(aug17_100000), "mid_day", "Mid-Day starts at 10:00 AM LA");
assert.equal(currentMedicationPeriodAt(aug17_155959), "mid_day", "still Mid-Day at 3:59:59 PM");
assert.equal(currentMedicationPeriodAt(aug17_160000), "pm", "PM starts at 4:00 PM LA");
assert.equal(currentMedicationPeriodAt(aug17_235959), "pm");

{
  const charlieAm = med({ gingrMedicationId: "med-charlie-am", scheduleKind: "am", gingrScheduleLabel: "AM" });
  const at959 = buildTlBoardMedicationRows({
    medications: [charlieAm],
    now: aug17_095959,
    lastSuccessfulSyncAt: aug17_095959.toISOString(),
    syncSucceeded: true
  });
  assert.equal(at959.overdue.length, 0);
  assert.equal(at959.current.length, 1);
  assert.equal(at959.current[0].displayStatus, "needs_medication");

  const at1000 = buildTlBoardMedicationRows({
    medications: [charlieAm],
    now: aug17_100000,
    lastSuccessfulSyncAt: aug17_100000.toISOString(),
    syncSucceeded: true
  });
  assert.equal(at1000.overdue.length, 1, "incomplete AM becomes overdue at 10:00 AM");
  assert.equal(at1000.overdue[0].displayStatus, "overdue");
  assert.equal(at1000.overdue[0].overdueSourcePeriod, "am");
}

{
  const atlasMid = med({
    gingrMedicationId: "med-atlas-mid",
    dogName: "Atlas",
    scheduleKind: "mid_day",
    gingrScheduleLabel: "Mid-Day",
    administrationStatus: "administered",
    administeredAt: aug17_120300.toISOString(),
    administeredBy: "Ivonne"
  });

  const before4pm = buildTlBoardMedicationRows({
    medications: [atlasMid],
    now: aug17_155959,
    lastSuccessfulSyncAt: aug17_155959.toISOString(),
    syncSucceeded: true
  });
  assert.equal(before4pm.current.some((r) => r.displayStatus === "administered"), true, "completed Mid-Day visible before 4 PM");

  const after4pm = buildTlBoardMedicationRows({
    medications: [atlasMid],
    now: aug17_160000,
    lastSuccessfulSyncAt: aug17_160000.toISOString(),
    syncSucceeded: true
  });
  assert.equal(after4pm.current.length, 0, "completed Mid-Day hides at 4:00 PM");
}

{
  const pillBox = med({
    gingrMedicationId: "med-pill-box",
    gingrScheduleLabel: "Pill Box",
    scheduleKind: "other_special",
    medicationName: "Special Med"
  });
  const rows = buildTlBoardMedicationRows({
    medications: [pillBox],
    now: aug17_100000,
    lastSuccessfulSyncAt: aug17_100000.toISOString(),
    syncSucceeded: true
  });
  assert.equal(rows.current.length, 1, "unknown schedule is never dropped");
  assert.equal(rows.current[0].scheduleKind, "other_special");
  assert.equal(normalizeScheduleLabel("Pill Box").kind, "other_special");
}

{
  const apoquel = med({
    gingrMedicationId: "med-apoquel",
    medicationName: "Apoquel",
    scheduleKind: "mid_day",
    gingrScheduleLabel: "Mid-Day",
    administrationStatus: "administered",
    administeredAt: aug17_120300.toISOString(),
    administeredBy: "Ivonne"
  });
  const gaba = med({
    gingrMedicationId: "med-gaba",
    medicationName: "Gabapentin",
    scheduleKind: "mid_day",
    gingrScheduleLabel: "Mid-Day"
  });
  const rows = buildTlBoardMedicationRows({
    medications: [apoquel, gaba],
    now: aug17_120000,
    lastSuccessfulSyncAt: aug17_120000.toISOString(),
    syncSucceeded: true
  });
  assert.ok(rows.current.some((r) => r.medicationName === "Apoquel" && r.displayStatus === "administered"));
  assert.ok(rows.current.some((r) => r.medicationName === "Gabapentin" && r.displayStatus === "needs_medication"));
}

{
  const duplicate = med({ gingrMedicationId: "dup-1" });
  const rows = buildTlBoardMedicationRows({
    medications: [duplicate, duplicate],
    now: aug17_080000,
    lastSuccessfulSyncAt: aug17_080000.toISOString(),
    syncSucceeded: true
  });
  assert.equal(rows.current.length, 1, "duplicate API rows dedupe by stable key");
}

{
  const meta = buildTlBoardSyncMeta(
    {
      medications: [],
      now: aug17_100000,
      lastSuccessfulSyncAt: null,
      syncSucceeded: false,
      lastError: "timeout"
    },
    { due: 0, completed: 0, remaining: 0, overdue: 0 }
  );
  assert.equal(meta.allClear, false, "API failure must not create ALL CLEAR");
}

{
  const meta = buildTlBoardSyncMeta(
    {
      medications: [],
      now: aug17_100000,
      lastSuccessfulSyncAt: aug17_095959.toISOString(),
      syncSucceeded: true
    },
    { due: 0, completed: 0, remaining: 0, overdue: 0 }
  );
  assert.equal(meta.allClear, true, "ALL CLEAR only after successful sync with zero rows");
}

assert.equal(
  incompleteMedicationIsOverdue("pm", null, aug18_000000),
  true,
  "unresolved PM incomplete stays overdue after midnight until Gingr reconciles"
);

{
  const luna = med({
    gingrMedicationId: "med-luna-apoquel",
    dogName: "Luna",
    medicationName: "Apoquel",
    scheduleKind: "mid_day",
    gingrScheduleLabel: "Mid-Day"
  });
  const needs = buildTlBoardMedicationRows({
    medications: [luna],
    now: aug17_140000,
    lastSuccessfulSyncAt: aug17_140000.toISOString(),
    syncSucceeded: true
  });
  assert.equal(needs.current[0].displayStatus, "needs_medication");

  const administered = buildTlBoardMedicationRows({
    medications: [
      {
        ...luna,
        administrationStatus: "administered",
        administeredAt: aug17_141400.toISOString(),
        administeredBy: "Ivonne"
      }
    ],
    now: aug17_141400,
    lastSuccessfulSyncAt: aug17_141400.toISOString(),
    syncSucceeded: true
  });
  assert.equal(administered.current[0].displayStatus, "administered");
  assert.equal(administered.current[0].administeredBy, "Ivonne");

  const reversed = buildTlBoardMedicationRows({
    medications: [{ ...luna, administrationStatus: "not_administered", administeredAt: null, administeredBy: null }],
    now: aug17_141500,
    lastSuccessfulSyncAt: aug17_141500.toISOString(),
    syncSucceeded: true
  });
  assert.equal(reversed.current[0].displayStatus, "needs_medication", "Gingr correction back to incomplete updates board state");
}

console.log("test-tl-digi-board-windows: ok");
