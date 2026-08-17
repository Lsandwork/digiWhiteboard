import { laServiceDate } from "./medication-windows";
import type { TlOvernightLodgingArea } from "./config";
import type { TlLodgingAreaKey } from "./constants";
import {
  dosageFromItem,
  medicationNameFromItem,
  notesFromItem,
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
  const notes = notesFromItem(resolved.item);
  const administration = context.administration ?? null;

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
    instructions: notes,
    notes: administration?.administrationNotes || notes,
    administrationStatus: administration?.administrationStatus ?? "not_administered",
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
  return resolvedSchedules.map((resolved) =>
    buildTlGingrMedicationRecord(resolved, {
      ...context,
      administration: administrationByScheduleId?.get(String(resolved.item.id)) ?? context.administration ?? null
    })
  );
}
