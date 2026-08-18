/**
 * Unit tests for TL Digi Board normalize / lodging / schedule helpers.
 * Does NOT call live Gingr.
 */
import assert from "node:assert/strict";
import { DEFAULT_TL_DIGI_BOARD_CONFIG } from "../lib/tl-digi-board/config";
import {
  dosageFromItem,
  flattenAnimalMedicationSchedules,
  flattenAndResolveMedicationSchedules,
  notesFromItem,
  resolveMedicationSchedule,
  type GingrAnimalMedicationScheduleItem,
  type GingrMedicationInfoPayload
} from "../lib/tl-digi-board/gingr-medication";
import {
  isOvernightReservationType,
  matchOvernightLodgingArea,
  parseRunName
} from "../lib/tl-digi-board/lodging";
import { buildTlGingrMedicationRecord } from "../lib/tl-digi-board/normalize";
import { splitMedicationDisplayNotes } from "../lib/tl-digi-board/medication-notes";
import { normalizeScheduleLabel } from "../lib/tl-digi-board/medication-windows";

// --- lodging parse ---
{
  const den = parseRunName("Den: B63");
  assert.equal(den.areaKey, "den");
  assert.equal(den.runLabel, "B63");
  assert.equal(den.lodgingLabel, "DEN • B63");

  const suite = parseRunName("Suite: 4");
  assert.equal(suite.areaKey, "suite");
  assert.equal(suite.runLabel, "4");
  assert.equal(suite.lodgingLabel, "SUITE • 4");

  const petite = parseRunName("Petite Suite: 2");
  assert.equal(petite.areaKey, "petite_suite");
  assert.equal(petite.runLabel, "2");
  assert.equal(petite.lodgingLabel, "PETITE SUITE • 2");

  const empty = parseRunName(null);
  assert.equal(empty.areaKey, null);
  assert.equal(empty.lodgingLabel, null);
}

// --- overnight type filter ---
{
  const config = DEFAULT_TL_DIGI_BOARD_CONFIG;

  assert.equal(matchOvernightLodgingArea("Overnight: Den", "4", config), "den");
  assert.equal(matchOvernightLodgingArea("Overnight: Petite Suite", "12", config), "petite_suite");
  assert.equal(matchOvernightLodgingArea("Overnight: Suite", "3", config), "suite");

  // Petite Suite must not match Suite matcher.
  assert.equal(matchOvernightLodgingArea("Overnight: Petite Suite", null, config), "petite_suite");

  // Type id alone is enough.
  assert.equal(matchOvernightLodgingArea(null, 12, config), "petite_suite");
  assert.equal(isOvernightReservationType("Daycare", "1", config), false);
  assert.equal(isOvernightReservationType("Overnight: Suite", null, config), true);
}

// --- schedule flatten (object keyed by schedule_id) ---
{
  const payload: GingrMedicationInfoPayload = {
    medicationSchedules: [
      { id: "1", time: "AM" },
      { id: "2", time: "MIDDAY" },
      { id: "3", time: "PM" },
      { id: "5", time: "BEDTIME" }
    ],
    animal_medication_schedules: {
      "1": [
        {
          id: "4447",
          medication_schedule_id: "1",
          medication_notes: { value: "with food" },
          medication_amount: { value: "2", value_string: "2" },
          medication_type: { value: "fluoxetine", value_string: "fluoxetine" },
          medication_unit: { value: "Pill", value_string: "Pill" }
        }
      ],
      "5": [
        {
          id: "4448",
          medication_schedule_id: "5",
          medication_notes: { value: null },
          medication_amount: { value: "1", value_string: "1" },
          medication_type: { value: "trazodone", value_string: "trazodone" },
          medication_unit: { value: "Pill", value_string: "Pill" }
        }
      ]
    }
  };

  const flat = flattenAnimalMedicationSchedules(payload.animal_medication_schedules);
  assert.equal(flat.length, 2);
  assert.equal(flat[0].id, "4447");
  assert.equal(flat[1].id, "4448");

  const resolved = flattenAndResolveMedicationSchedules(payload);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].scheduleKind, "am");
  assert.equal(resolved[0].gingrScheduleLabel, "AM");
  // BEDTIME is not in Fitdog id map → label alias → other_special
  assert.equal(resolved[1].scheduleKind, "other_special");
  assert.equal(resolved[1].gingrScheduleLabel, "BEDTIME");
}

// --- dosage ---
{
  const item: GingrAnimalMedicationScheduleItem = {
    id: "1",
    medication_schedule_id: "1",
    medication_amount: { value: "2", value_string: "2" },
    medication_unit: { value: "Pill", value_string: "Pill" },
    medication_type: { value: "fluoxetine", value_string: "fluoxetine" }
  };
  assert.equal(dosageFromItem(item), "2 Pill");
}

// --- unknown schedule → other_special ---
{
  assert.equal(normalizeScheduleLabel("Pill Box").kind, "other_special");
  assert.equal(normalizeScheduleLabel("MIDDAY").kind, "mid_day");
  assert.equal(normalizeScheduleLabel("bedtime").kind, "other_special");

  const labelMap = new Map<string, string>([["99", "Custom Special"]]);
  const item: GingrAnimalMedicationScheduleItem = {
    id: "9",
    medication_schedule_id: "99",
    medication_amount: { value: "1", value_string: "1" },
    medication_type: { value: "med", value_string: "med" },
    medication_unit: { value: "ml", value_string: "ml" }
  };
  const resolved = resolveMedicationSchedule(item, labelMap);
  assert.equal(resolved.scheduleKind, "other_special");
  assert.equal(resolved.gingrScheduleLabel, "Custom Special");
}

// --- normalize record (defaults to not_administered without history) ---
{
  const item: GingrAnimalMedicationScheduleItem = {
    id: "4447",
    medication_schedule_id: "1",
    medication_notes: { value: "give with breakfast" },
    medication_amount: { value: "2", value_string: "2" },
    medication_type: { value: "fluoxetine", value_string: "fluoxetine" },
    medication_unit: { value: "Pill", value_string: "Pill" }
  };
  const resolved = resolveMedicationSchedule(item, new Map([["1", "AM"]]));
  const record = buildTlGingrMedicationRecord(resolved, {
    gingrAnimalId: "100",
    gingrReservationId: "200",
    dogName: "Mochi",
    lodgingAreaKey: "suite",
    lodgingRunName: "Suite: 4",
    lodgingLabel: "SUITE • 4",
    serviceDate: "2026-08-17"
  });

  assert.equal(record.gingrMedicationId, "4447");
  assert.equal(record.medicationName, "fluoxetine");
  assert.equal(record.dosage, "2 Pill");
  assert.equal(record.scheduleKind, "am");
  assert.equal(record.administrationStatus, "not_administered");
  assert.equal(record.administeredAt, null);
  assert.equal(record.administeredBy, null);
  assert.equal(record.lodgingLabel, "SUITE • 4");
  assert.equal(record.instructions, "give with breakfast");
}

// --- notes from value_string, plain strings, extra Gingr fields, and report notes ---
{
  const valueStringItem: GingrAnimalMedicationScheduleItem = {
    id: "dougal-1",
    medication_schedule_id: "3",
    medication_notes: { value: null, value_string: "Administer 1 drop into LEFT eye" },
    medication_amount: { value: "1", value_string: "1" },
    medication_type: { value: "tobra", value_string: "Tobramycin" },
    medication_unit: { value: "Drops", value_string: "Drops" },
    sourceNotes: "Could not mark administered in Gingr — see kennel card."
  };
  const dougal = buildTlGingrMedicationRecord(
    resolveMedicationSchedule(valueStringItem, new Map([["3", "PM"]])),
    {
      gingrAnimalId: "dougal",
      gingrReservationId: "res-dougal",
      dogName: "Dougal",
      lodgingLabel: "DEN",
      serviceDate: "2026-08-17",
      administration: {
        administrationStatus: "not_administered",
        administeredAt: null,
        administeredBy: null,
        administrationNotes: "Unable to administer — dog too wiggly, retry PM.",
        statusLabel: "Unable to Administer"
      }
    }
  );
  assert.equal(dougal.instructions, "Administer 1 drop into LEFT eye");
  assert.match(dougal.notes ?? "", /Unable to administer/);
  assert.match(dougal.notes ?? "", /Could not mark administered/);
  assert.equal(dougal.administrationStatus, "not_administered");

  const stringNotesPayload: GingrMedicationInfoPayload = {
    medicationSchedules: [{ id: "3", time: "PM" }],
    animal_medication_schedules: {
      "3": [
        {
          id: "plain-1",
          medication_schedule_id: "3",
          medication_notes: "Give with bread",
          medication_amount: { value: "2", value_string: "2" },
          medication_type: { value: "gaba", value_string: "Gabapentin" },
          medication_unit: { value: "Pill", value_string: "Pill" }
        } as GingrAnimalMedicationScheduleItem
      ]
    }
  };
  const flat = flattenAnimalMedicationSchedules(stringNotesPayload.animal_medication_schedules);
  assert.equal(notesFromItem(flat[0]!), "Give with bread");
}

{
  const split = splitMedicationDisplayNotes({
    instructions: "Administer 1 drop into LEFT eye",
    notes: "Could not mark administered in Gingr."
  });
  assert.equal(split.instructions, "Administer 1 drop into LEFT eye");
  assert.equal(split.notes, "Could not mark administered in Gingr.");
}

console.log("test-tl-digi-board-normalize: ok");
