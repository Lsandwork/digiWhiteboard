/**
 * Tests for Gingr Medication Report administration parsing.
 * Fixtures mirror the Gingr web Medication Report / history UI shapes.
 */
import assert from "node:assert/strict";
import {
  classifyGingrMedicationReportStatus,
  extractAdministrationRecordsFromHistory,
  flattenAdministrationData,
  isAdministeredReportStatus,
  isUnableToAdministerReportStatus,
  resolveAdministrationForSchedule
} from "../lib/tl-digi-board/gingr-medication-report";
import { buildTlGingrMedicationRecord } from "../lib/tl-digi-board/normalize";
import { resolveMedicationSchedule, type GingrAnimalMedicationScheduleItem } from "../lib/tl-digi-board/gingr-medication";
import { buildTlBoardMedicationRows } from "../lib/tl-digi-board/board-state";
import { dateAtLaLocal } from "../lib/tl-digi-board/medication-windows";
import type { TlGingrMedicationRecord } from "../lib/tl-digi-board/types";

// --- status label detection ---
{
  assert.equal(isAdministeredReportStatus("1", "Administered"), true);
  assert.equal(isAdministeredReportStatus("2", "Not Administered"), false);
  assert.equal(isAdministeredReportStatus("3", "N/A"), false);
  assert.equal(isAdministeredReportStatus(null, "Unable to Administer"), false);
  assert.equal(isUnableToAdministerReportStatus(null, "Unable to Administer"), true);
  assert.equal(isAdministeredReportStatus(null, null), false);
  assert.equal(isAdministeredReportStatus("administered", null), true);
  assert.equal(isAdministeredReportStatus("", "Given"), true);
  assert.equal(classifyGingrMedicationReportStatus("3", "N/A"), "n_a");
  assert.equal(classifyGingrMedicationReportStatus("4", "Prepared"), "prepared");
  assert.equal(classifyGingrMedicationReportStatus("5", "Refused"), "refused");
  assert.equal(classifyGingrMedicationReportStatus("6", "Partially Administered"), "partially_administered");
  assert.equal(classifyGingrMedicationReportStatus("7", "Owner Administered"), "owner_administered");
  assert.equal(isAdministeredReportStatus("7", "Owner Administered"), true);
  assert.equal(isAdministeredReportStatus("6", "Partially Administered"), false);
}

// --- flatten array administrationData (Medication Report table shape) ---
{
  const statuses = [
    { value: "10", label: "Administered" },
    { value: "11", label: "Not Administered" }
  ];
  const rows = flattenAdministrationData(
    [
      {
        date: "2026-08-17",
        animal_medication_schedule_id: "4363",
        status: "10",
        notes: "",
        last_edited_at: "1755468000",
        last_edited_by: "Ivonne"
      },
      {
        date: "2026-08-17",
        animal_medication_schedule_id: "4448",
        status: "",
        notes: null
      }
    ],
    statuses
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].animalMedicationScheduleId, "4363");
  assert.equal(rows[0].statusLabel, "Administered");
  assert.equal(rows[0].lastEditedBy, "Ivonne");
  assert.equal(rows[1].statusValue, null);
}

// --- history payload nested under data[] ---
{
  const payload = {
    animal: { animal_name: "Cooper" },
    data: [
      {
        reservation: { id: "208116", check_in_stamp: "1755400000" },
        data: {
          statuses: [
            { value: "10", label: "Administered" },
            { value: "11", label: "Not Administered" }
          ],
          administrationData: [
            {
              date: "2026-08-17",
              animal_medication_schedule_id: "4363",
              status: "10",
              notes: "",
              last_edited_at: "1755468000",
              last_edited_by: "Ivonne"
            },
            {
              date: "2026-08-17",
              animal_medication_schedule_id: "4447",
              status: "10",
              last_edited_at: "1755468100",
              last_edited_by: "Ivonne"
            },
            {
              date: "2026-08-17",
              animal_medication_schedule_id: "4448",
              status: "",
              notes: null
            }
          ]
        }
      }
    ]
  };

  const records = extractAdministrationRecordsFromHistory(payload);
  assert.ok(records.length >= 3);

  const cooperAm = resolveAdministrationForSchedule({
    records,
    animalMedicationScheduleId: "4363",
    serviceDate: "2026-08-17"
  });
  assert.equal(cooperAm.administrationStatus, "administered");
  assert.equal(cooperAm.administeredBy, "Ivonne");
  assert.ok(cooperAm.administeredAt);

  const lunaPm = resolveAdministrationForSchedule({
    records,
    animalMedicationScheduleId: "4448",
    serviceDate: "2026-08-17"
  });
  assert.equal(lunaPm.administrationStatus, "not_administered");
  assert.equal(lunaPm.administeredAt, null);
}

// --- object-keyed administrationData (reservation panel shape) ---
{
  const records = flattenAdministrationData(
    {
      "4363": {
        report_status_id: "10",
        notes: "ok",
        last_edited_at: "1755468000",
        last_edited_by: "Staff"
      }
    },
    [{ value: "10", label: "Administered" }]
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].animalMedicationScheduleId, "4363");
  const resolved = resolveAdministrationForSchedule({
    records,
    animalMedicationScheduleId: "4363",
    serviceDate: "2026-08-17"
  });
  assert.equal(resolved.administrationStatus, "administered");
  assert.equal(resolved.administrationNotes, "ok");
}

{
  const nestedByDate = flattenAdministrationData(
    {
      "2026-08-17": {
        "4770": {
          report_status_id: "12",
          notes: "Hold — cannot mark administered in Gingr.",
          last_edited_by: "Ivonne"
        }
      }
    },
    [{ value: "12", label: "Unable to Administer" }]
  );
  const dougalNested = resolveAdministrationForSchedule({
    records: nestedByDate,
    animalMedicationScheduleId: "4770",
    serviceDate: "2026-08-17"
  });
  assert.equal(dougalNested.administrationStatus, "unable_to_administer");
  assert.equal(dougalNested.statusLabel, "Unable to Administer");
  assert.match(dougalNested.administrationNotes ?? "", /cannot mark administered/);
}

{
  const records = flattenAdministrationData(
    [
      {
        date: "2026-08-17",
        animal_medication_schedule_id: "dougal-eye",
        status: "12",
        notes: "Could not mark administered. Retry with two people."
      }
    ],
    [
      { value: "10", label: "Administered" },
      { value: "12", label: "Unable to Administer" }
    ]
  );
  const resolved = resolveAdministrationForSchedule({
    records,
    animalMedicationScheduleId: "dougal-eye",
    serviceDate: "2026-08-17"
  });
  assert.equal(resolved.administrationStatus, "unable_to_administer");
  assert.equal(resolved.statusLabel, "Unable to Administer");
  assert.match(resolved.administrationNotes ?? "", /Could not mark administered/);
}

// --- normalize merges administration ---
{
  const item: GingrAnimalMedicationScheduleItem = {
    id: "4363",
    medication_schedule_id: "1",
    medication_notes: { value: "every 24 hrs" },
    medication_amount: { value: "5", value_string: "1" },
    medication_type: { value: "1005", value_string: "Apoquel" },
    medication_unit: { value: "1", value_string: "Pill" }
  };
  const resolved = resolveMedicationSchedule(item, new Map([["1", "AM"]]));
  const record = buildTlGingrMedicationRecord(resolved, {
    gingrAnimalId: "2608",
    gingrReservationId: "208116",
    dogName: "Cooper",
    lodgingAreaKey: "den",
    lodgingLabel: "DEN • B62",
    serviceDate: "2026-08-17",
    administration: {
      administrationStatus: "administered",
      administeredAt: "2026-08-17T19:00:00.000Z",
      administeredBy: "Ivonne",
      administrationNotes: null,
      statusLabel: "Administered"
    }
  });
  assert.equal(record.administrationStatus, "administered");
  assert.equal(record.administeredBy, "Ivonne");
  assert.equal(record.instructions, "every 24 hrs");
}

// --- board rows: administered AM clears overdue during Mid-Day ---
{
  const now = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 15, minute: 46 });
  const base = (partial: Partial<TlGingrMedicationRecord>): TlGingrMedicationRecord => ({
    gingrMedicationId: "1",
    gingrAnimalId: "1",
    gingrReservationId: "1",
    dogName: "Dog",
    photoUrl: null,
    lodgingLabel: "DEN",
    lodgingAreaKey: "den",
    lodgingRunName: null,
    gingrScheduleLabel: "AM",
    scheduleKind: "am",
    medicationName: "Med",
    dosage: "1 Pill",
    instructions: null,
    notes: null,
    administrationStatus: "not_administered",
    administeredAt: null,
    administeredBy: null,
    serviceDate: "2026-08-17",
    ...partial
  });

  const rows = buildTlBoardMedicationRows({
    medications: [
      base({
        gingrMedicationId: "4363",
        dogName: "Cooper",
        medicationName: "Apoquel",
        administrationStatus: "administered",
        administeredAt: "2026-08-17T19:00:00.000Z",
        administeredBy: "Ivonne"
      }),
      base({
        gingrMedicationId: "4448",
        dogName: "Luna",
        gingrScheduleLabel: "PM",
        scheduleKind: "pm",
        medicationName: "Gabapentin",
        administrationStatus: "not_administered"
      })
    ],
    now,
    lastSuccessfulSyncAt: now.toISOString(),
    syncSucceeded: true,
    administrationStatusAvailable: true
  });

  assert.equal(rows.overdue.length, 0, "administered AM must not stay overdue");
  assert.equal(rows.summary.overdue, 0);
  assert.equal(rows.summary.completed, 0, "completed AM hidden outside AM window");
}

{
  const now = dateAtLaLocal({ year: 2026, month: 8, day: 17, hour: 15, minute: 46 });
  const base = (partial: Partial<TlGingrMedicationRecord>): TlGingrMedicationRecord => ({
    gingrMedicationId: "1",
    gingrAnimalId: "1",
    gingrReservationId: "1",
    dogName: "Dog",
    photoUrl: null,
    lodgingLabel: "DEN",
    lodgingAreaKey: "den",
    lodgingRunName: null,
    gingrScheduleLabel: "AM",
    scheduleKind: "am",
    medicationName: "Med",
    dosage: "1 Pill",
    instructions: null,
    notes: null,
    administrationStatus: "not_administered",
    administeredAt: null,
    administeredBy: null,
    serviceDate: "2026-08-17",
    ...partial
  });

  const mixed = buildTlBoardMedicationRows({
    medications: [
      base({ gingrMedicationId: "na", dogName: "Nellie", administrationStatus: "n_a", gingrReportStatusLabel: "N/A" }),
      base({
        gingrMedicationId: "owner",
        dogName: "Otto",
        administrationStatus: "owner_administered",
        gingrReportStatusLabel: "Owner Administered"
      }),
      base({
        gingrMedicationId: "prep",
        dogName: "Pip",
        administrationStatus: "prepared",
        gingrReportStatusLabel: "Prepared"
      }),
      base({
        gingrMedicationId: "ref",
        dogName: "Ruby",
        administrationStatus: "refused",
        gingrReportStatusLabel: "Refused"
      }),
      base({
        gingrMedicationId: "part",
        dogName: "Pax",
        administrationStatus: "partially_administered",
        gingrReportStatusLabel: "Partially Administered"
      })
    ],
    now,
    lastSuccessfulSyncAt: now.toISOString(),
    syncSucceeded: true,
    administrationStatusAvailable: true
  });

  assert.equal(mixed.overdue.some((row) => row.dogName === "Nellie"), false, "N/A must not appear as overdue");
  assert.equal(mixed.current.some((row) => row.dogName === "Nellie"), false, "N/A must not appear as due");
  assert.equal(mixed.overdue.some((row) => row.dogName === "Otto"), false, "Owner Administered is complete");
  assert.equal(
    mixed.overdue.find((row) => row.dogName === "Pip")?.displayStatus,
    "overdue",
    "Prepared AM is still due after the AM window"
  );
  assert.equal(mixed.current.find((row) => row.dogName === "Ruby")?.displayStatus, "refused");
  assert.equal(mixed.overdue.find((row) => row.dogName === "Pax")?.displayStatus, "overdue");
}

{
  const prepared = resolveAdministrationForSchedule({
    records: flattenAdministrationData(
      [{ date: "2026-08-17", animal_medication_schedule_id: "1", status: "4" }],
      [{ value: "4", label: "Prepared" }]
    ),
    animalMedicationScheduleId: "1",
    serviceDate: "2026-08-17"
  });
  assert.equal(prepared.administrationStatus, "prepared");
  assert.equal(prepared.statusLabel, "Prepared");
}

console.log("test-tl-digi-board-medication-report: ok");
