import { laServiceDate } from "./medication-windows";
import type { TlOvernightLodgingArea } from "./config";
import type { TlLodgingAreaKey } from "./constants";
import {
  dosageFromItem,
  medicationNameFromItem,
  notesFromItem,
  type ResolvedGingrMedicationSchedule
} from "./gingr-medication";
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
};

/**
 * Build a board medication record from a flattened Gingr schedule item + lodging context.
 *
 * Administration status: the public Gingr API does not expose administration /
 * medication_report fields (those endpoints 404). We always set
 * administrationStatus to "not_administered" and never invent administered_* values.
 */
export function buildTlGingrMedicationRecord(
  resolved: ResolvedGingrMedicationSchedule,
  context: TlMedicationNormalizeContext
): TlGingrMedicationRecord {
  const now = context.now ?? new Date();
  const dosage = dosageFromItem(resolved.item);
  const notes = notesFromItem(resolved.item);

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
    notes,
    // API limitation — no administration status in get_medication_info.
    administrationStatus: "not_administered",
    administeredAt: null,
    administeredBy: null,
    serviceDate: context.serviceDate ?? laServiceDate(now)
  };
}

export function buildTlGingrMedicationRecords(
  resolvedSchedules: ResolvedGingrMedicationSchedule[],
  context: TlMedicationNormalizeContext
): TlGingrMedicationRecord[] {
  return resolvedSchedules.map((resolved) => buildTlGingrMedicationRecord(resolved, context));
}
