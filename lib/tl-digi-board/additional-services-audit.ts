import type { GingrReservation } from "@/lib/integrations/gingr/types";
import {
  collectTlTrackedServiceRows,
  loadTlBoardReservationsForAdditionalServices
} from "./gingr-reservation-services";
import {
  resolveGingrServiceCompletion,
  serviceCancelled,
  serviceOnDate,
  type GingrServiceCompletionResolution
} from "./gingr-service-completion";
import {
  canonicalTlBoardServiceName,
  TL_BOARD_REQUIRED_ADDITIONAL_SERVICES,
  type TlBoardRequiredAdditionalService
} from "./tl-service-names";

import type { TlAdditionalServicesCompletionAudit, TlServiceTypeAuditRow } from "./types";

function emptyTypeRow(serviceType: TlBoardRequiredAdditionalService): TlServiceTypeAuditRow {
  return {
    serviceType,
    status: "not_scheduled_today",
    scheduledToday: 0,
    reliable: 0,
    unreliable: 0,
    complete: 0,
    incomplete: 0,
    unknown: 0,
    unknownSamples: []
  };
}

function applySample(
  row: TlServiceTypeAuditRow,
  resolution: GingrServiceCompletionResolution,
  sampleId: string
) {
  row.scheduledToday += 1;
  if (resolution.reliable) {
    row.reliable += 1;
    if (resolution.state === "complete") row.complete += 1;
    else if (resolution.state === "incomplete") row.incomplete += 1;
  } else {
    row.unreliable += 1;
    row.unknown += 1;
    if (row.unknownSamples.length < 5) row.unknownSamples.push(sampleId);
  }
}

/**
 * Audit every required TL additional service type against live Gingr reservation rows.
 * Passes only when every scheduled sample today has a reliable completion field.
 */
export function auditTlAdditionalServicesFromReservations(
  reservations: GingrReservation[],
  date: string,
  now = new Date()
): TlAdditionalServicesCompletionAudit {
  const perTypeMap = new Map<TlBoardRequiredAdditionalService, TlServiceTypeAuditRow>();
  for (const serviceType of TL_BOARD_REQUIRED_ADDITIONAL_SERVICES) {
    perTypeMap.set(serviceType, emptyTypeRow(serviceType));
  }

  const issues: string[] = [];

  for (const sample of collectTlTrackedServiceRows(reservations, date)) {
    if (serviceCancelled(sample.service) || !serviceOnDate(sample.service, date)) continue;

    const canonical = canonicalTlBoardServiceName(sample.serviceName);
    if (!canonical) {
      issues.push(`Untracked TL service name in Gingr payload: ${sample.serviceName}`);
      continue;
    }

    const row = perTypeMap.get(canonical)!;
    const resolution = resolveGingrServiceCompletion(sample.service);
    const sampleId = `${sample.reservationId}:${sample.serviceName}:${sample.scheduledAt || date}`;
    applySample(row, resolution, sampleId);

    if (!resolution.reliable) {
      issues.push(
        `${canonical} on reservation ${sample.reservationId} lacks Gingr completion fields (needs reservation.complete).`
      );
    }
  }

  const perType = TL_BOARD_REQUIRED_ADDITIONAL_SERVICES.map((type) => {
    const row = perTypeMap.get(type)!;
    row.status =
      row.scheduledToday === 0 ? "not_scheduled_today" : row.unreliable === 0 ? "pass" : "fail";
    return row;
  });
  const allReliable = perType.every((row) => row.unreliable === 0);
  const allRequiredTypesPass = perType.every((row) => row.status !== "fail");

  if (!allReliable) {
    issues.push(
      "One or more scheduled TL additional services are missing Gingr completion fields. Board shows COMPLETION UNKNOWN for those rows — they are not treated as incomplete."
    );
  }

  return {
    auditedAt: now.toISOString(),
    serviceDate: date,
    reservationCount: reservations.length,
    allReliable,
    allRequiredTypesPass,
    perType,
    issues: [...new Set(issues)],
    completionSource: "reservation.complete",
    documentationPath: "docs/tl-digi-board/ADDITIONAL_SERVICES_GINGR.md"
  };
}

export async function runTlAdditionalServicesCompletionAudit(now = new Date()): Promise<TlAdditionalServicesCompletionAudit> {
  const { date, reservations } = await loadTlBoardReservationsForAdditionalServices(now);
  return auditTlAdditionalServicesFromReservations(reservations, date, now);
}

export function assertTlAdditionalServicesAuditPasses(audit: TlAdditionalServicesCompletionAudit) {
  if (audit.allRequiredTypesPass) return;
  const failing = audit.perType.filter((row) => row.unreliable > 0);
  const detail = failing
    .map((row) => `${row.serviceType}: ${row.unreliable} unreliable / ${row.scheduledToday} scheduled`)
    .join("; ");
  throw new Error(`TL additional services completion audit failed: ${detail}`);
}
