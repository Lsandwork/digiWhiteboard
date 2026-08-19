import { laServiceDate } from "./medication-windows";
import type { TlOvernightLodgingArea } from "./config";
import type { TlLodgingAreaKey } from "./constants";
import {
  dosageFromItem,
  extraNotesFromItem,
  medicationNameFromItem,
  notesFromItem,
  readGingrText,
  uniqueNoteParts,
  type ResolvedGingrMedicationSchedule
} from "./gingr-medication";
import type { ResolvedMedicationAdministration } from "./gingr-medication-report";
import type { TlGingrMedicationRecord } from "./types";

export type TlMedicationNormalizeContext = {
  gingrAnimalId: string;
  gingrReservationId: string | null;
  dogName: string;
  photoUrl?: string | null;
  lodgingAreaKey?: TlOvernightLodgingArea | TlLodgingAreaKey | null;
  lodgingRunName?: string | null;
  lodgingLabel?: string | null;
  serviceDate?: string;
  now?: Date;
  /** Administration status from get_medication_report_history when available. */
  administration?: ResolvedMedicationAdministration | null;
  /**
   * Animal-level Gingr medicationNotes (kennel/run card schedule-notes).
   * Shown when staff cannot mark administered and Gingr still displays the note.
   */
  animalMedicationNotes?: string | null;
};

/**
 * Build a board medication record from a flattened Gingr schedule item + lodging context.
 *
 * Administration status comes from get_medication_report_history when provided.
 * Without history data we keep not_administered (never invent ADMINISTERED).
 */
export function buildTlGingrMedicationRecord(
  resolved: ResolvedGingrMedicationSchedule,
  context: TlMedicationNormalizeContext
): TlGingrMedicationRecord {
  const now = context.now ?? new Date();
  const dosage = dosageFromItem(resolved.item);
  const scheduleNotes = notesFromItem(resolved.item);
  const extraScheduleNotes = extraNotesFromItem(resolved.item);
  const administration = context.administration ?? null;
  const statusLabel = administration?.statusLabel?.trim() || null;
  const noteworthyStatus =
    statusLabel && !/^(administered|not[\s_-]*administered|n\/?a)$/i.test(statusLabel) ? statusLabel : null;
  const instructions = uniqueNoteParts([scheduleNotes, extraScheduleNotes])[0] ?? extraScheduleNotes ?? scheduleNotes;
  const animalNotes = readGingrText(context.animalMedicationNotes);
  const noteParts = uniqueNoteParts([
    administration?.administrationNotes,
    extraScheduleNotes,
    animalNotes
  ]).filter((part) => !instructions || part.toLowerCase() !== instructions.toLowerCase());
  if (
    noteworthyStatus &&
    !noteParts.some((part) => part.toLowerCase().includes(noteworthyStatus.toLowerCase()))
  ) {
    noteParts.push(noteworthyStatus);
  }
  const notes = noteParts.join(" · ") || null;

  return {
    gingrMedicationId: String(resolved.item.id),
    gingrAnimalId: String(context.gingrAnimalId),
    gingrReservationId: context.gingrReservationId ? String(context.gingrReservationId) : null,
    dogName: context.dogName,
    photoUrl: context.photoUrl ?? null,
    lodgingLabel: context.lodgingLabel ?? null,
    lodgingAreaKey: (context.lodgingAreaKey as TlLodgingAreaKey | null | undefined) ?? null,
    lodgingRunName: context.lodgingRunName ?? null,
    gingrScheduleLabel: resolved.gingrScheduleLabel,
    scheduleKind: resolved.scheduleKind,
    medicationName: medicationNameFromItem(resolved.item),
    dosage,
    instructions,
    notes,
    administrationStatus: administration?.administrationStatus ?? "not_administered",
    gingrReportStatusLabel: statusLabel,
    administeredAt: administration?.administeredAt ?? null,
    administeredBy: administration?.administeredBy ?? null,
    serviceDate: context.serviceDate ?? laServiceDate(now)
  };
}

export function buildTlGingrMedicationRecords(
  resolvedSchedules: ResolvedGingrMedicationSchedule[],
  context: TlMedicationNormalizeContext,
  administrationByScheduleId?: Map<string, ResolvedMedicationAdministration>
): TlGingrMedicationRecord[] {
  const records = resolvedSchedules.map((resolved) =>
    buildTlGingrMedicationRecord(resolved, {
      ...context,
      administration: administrationByScheduleId?.get(String(resolved.item.id)) ?? context.administration ?? null
    })
  );
  const animalNotes = String(context.animalMedicationNotes || "").trim();
  if (!records.length && animalNotes) {
    const stripped = readGingrText(animalNotes);
    if (stripped) records.push(buildNoteOnlyMedicationRecord(context, stripped));
  }
  return records;
}

/** Gingr can show animal-level medication notes even when there is no dose to mark administered. */
export function buildNoteOnlyMedicationRecord(
  context: TlMedicationNormalizeContext,
  notes: string
): TlGingrMedicationRecord {
  const now = context.now ?? new Date();
  return {
    gingrMedicationId: `notes:${context.gingrAnimalId}`,
    gingrAnimalId: String(context.gingrAnimalId),
    gingrReservationId: context.gingrReservationId ? String(context.gingrReservationId) : null,
    dogName: context.dogName,
    photoUrl: context.photoUrl ?? null,
    lodgingLabel: context.lodgingLabel ?? null,
    lodgingAreaKey: (context.lodgingAreaKey as TlLodgingAreaKey | null | undefined) ?? null,
    lodgingRunName: context.lodgingRunName ?? null,
    gingrScheduleLabel: "NOTES",
    scheduleKind: "other_special",
    medicationName: "Medication notes",
    dosage: null,
    instructions: null,
    notes,
    administrationStatus: "not_administered",
    gingrReportStatusLabel: null,
    administeredAt: null,
    administeredBy: null,
    serviceDate: context.serviceDate ?? laServiceDate(now)
  };
}
