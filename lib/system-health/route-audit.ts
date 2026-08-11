/**
 * Route Generator permanent audit + dog-level decision traces.
 * Fail-safe: never throws into generation path.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { createRouteCorrelationId } from "@/lib/system-health/correlation";
import { emitSystemHealthEvent, emitSystemHealthEvents } from "@/lib/system-health/events";
import { sanitizeValue } from "@/lib/system-health/sanitize";
import {
  ROUTE_PIPELINE_STAGES,
  type DestinationMismatch,
  type DogDecisionTrace,
  type MissingDogRecord,
  type PipelineStage,
  type PipelineStageStatus,
  type QualityGate
} from "@/lib/system-health/types";
import type { ReconciliationReport } from "@/lib/route-generator/reconciliation";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";

function releaseVersion(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_VERSION || null;
}

function environment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function itemSource(item: NormalizedReportItem): string {
  const raw = item.raw as Record<string, unknown>;
  if (raw?.source === "manual" || raw?.source === "manual_taxi" || raw?.manual === true) return "Manual";
  return "Gingr";
}

function destLabel(item: NormalizedReportItem): string {
  if (item.locationType) return item.locationType;
  const facility = (item as NormalizedReportItem & { atFacility?: boolean }).atFacility;
  if (facility) return "FITDOG";
  if (item.addressRaw) return "HOME";
  return "UNKNOWN";
}

export function buildPipelineStages(params: {
  itemCount: number;
  recoverableCount: number;
  blockedCount: number;
  geocodedCount: number;
  addressCount: number;
  unassignedCount: number;
  destinationMismatches: number;
  missingCount: number;
  usedSynthetic: boolean;
  warnings: string[];
}): PipelineStage[] {
  const stages: PipelineStage[] = ROUTE_PIPELINE_STAGES.map((s, index) => ({
    stage: index + 1,
    key: s.key,
    label: s.label,
    status: "SKIPPED" as PipelineStageStatus,
    detail: null
  }));

  const set = (key: string, status: PipelineStageStatus, detail?: string) => {
    const row = stages.find((s) => s.key === key);
    if (row) {
      row.status = status;
      row.detail = detail ?? null;
    }
  };

  set("gingr_fetch", params.itemCount > 0 ? "PASS" : "WARNING", `${params.itemCount} records`);
  set("normalize", "PASS", `${params.itemCount} normalized`);
  set(
    "service_classification",
    "PASS",
    `${params.recoverableCount} recoverable / ${params.blockedCount} blocked`
  );
  set(
    "eligibility",
    params.blockedCount ? "WARNING" : "PASS",
    `${params.recoverableCount} eligible`
  );
  set("pickup_resolution", "PASS");
  set("dropoff_resolution", params.destinationMismatches ? "WARNING" : "PASS");
  set(
    "geocoding",
    params.usedSynthetic || params.geocodedCount < params.addressCount ? "WARNING" : "PASS",
    `${params.geocodedCount}/${params.addressCount} geocoded`
  );
  set("grouping", "PASS");
  set(
    "capacity_assignment",
    params.unassignedCount ? "FAIL" : "PASS",
    params.unassignedCount ? `${params.unassignedCount} unassigned` : "ok"
  );
  set(
    "route_assignment",
    params.missingCount || params.unassignedCount ? "FAIL" : "PASS",
    params.missingCount ? `${params.missingCount} missing` : "ok"
  );
  set("route_optimization", params.warnings.length ? "WARNING" : "PASS");
  set(
    "validation",
    params.missingCount || params.destinationMismatches || params.unassignedCount ? "FAIL" : "PASS"
  );
  set("owner_communication", "SKIPPED", "Prepared at approval");
  set("samsara_export_prep", "SKIPPED", "Prepared at export");
  set("final_approval", "SKIPPED");
  set("export", "SKIPPED");
  return stages;
}

export function buildDogDecisionTraces(params: {
  items: NormalizedReportItem[];
  reconciliation: ReconciliationReport;
}): DogDecisionTrace[] {
  const byKey = new Map<string, NormalizedReportItem>();
  for (const item of params.items) {
    const key = `${item.reservationId || item.dogId || item.dogName}:${item.direction}`;
    byKey.set(key, item);
  }

  return params.reconciliation.legs.map((leg) => {
    const item = byKey.get(`${leg.reservationId || leg.dogId || leg.dogName}:${leg.direction}`);
    const expected = leg.locationType || (item ? destLabel(item) : "UNKNOWN");
    const generated =
      leg.status === "ASSIGNED"
        ? expected
        : leg.status === "UNASSIGNED" || leg.status === "BLOCKED_WITH_REASON"
          ? null
          : expected;

    const steps: DogDecisionTrace["decisionTrace"] = [
      { step: "source", status: "PASS", detail: leg.source },
      {
        step: "normalize",
        status: "PASS",
        detail: `service=${leg.serviceCanonical || leg.serviceRaw || "unknown"}`
      },
      {
        step: "eligibility",
        status: leg.status === "BLOCKED_WITH_REASON" ? "FAIL" : "PASS",
        detail: leg.reason
      },
      {
        step: "route_assignment",
        status: leg.status === "ASSIGNED" ? "PASS" : leg.status === "UNASSIGNED" ? "FAIL" : "WARNING",
        detail: leg.routeVanKey || leg.reason || leg.status
      }
    ];

    let validationStatus = "PASS";
    let errorCode: string | null = null;
    if (leg.status === "UNASSIGNED") {
      validationStatus = "FAIL";
      errorCode = "MISSING_ROUTE_ASSIGNMENT";
    } else if (leg.status === "BLOCKED_WITH_REASON") {
      validationStatus = "FAIL";
      errorCode = "BLOCKED";
    }

    return {
      dogName: leg.dogName,
      dogId: leg.dogId,
      reservationId: leg.reservationId,
      source: leg.source,
      serviceCanonical: leg.serviceCanonical,
      serviceRaw: leg.serviceRaw,
      direction: leg.direction,
      pickupRequested: leg.direction === "pickup" ? expected : null,
      dropoffRequested: leg.direction === "dropoff" ? expected : null,
      pickupNormalized: leg.direction === "pickup" ? expected : null,
      dropoffNormalized: leg.direction === "dropoff" ? expected : null,
      eligibility: leg.status === "BLOCKED_WITH_REASON" ? "FAIL" : "PASS",
      routeVanKey: leg.routeVanKey,
      routeName: leg.routeName,
      generatedDestination: generated,
      expectedDestination: expected,
      validationStatus,
      errorCode,
      decisionTrace: steps,
      metadata: { legStatus: leg.status, reason: leg.reason }
    };
  });
}

export function detectDestinationMismatches(traces: DogDecisionTrace[]): DestinationMismatch[] {
  const mismatches: DestinationMismatch[] = [];
  for (const t of traces) {
    if (
      t.expectedDestination &&
      t.generatedDestination &&
      t.expectedDestination !== "UNKNOWN" &&
      t.generatedDestination !== t.expectedDestination
    ) {
      mismatches.push({
        dog: t.dogName || "unknown",
        dogId: t.dogId,
        expected: t.expectedDestination,
        actual: t.generatedDestination,
        direction: t.direction,
        stage: "destination_validation"
      });
      t.validationStatus = "FAIL";
      t.errorCode = "DESTINATION_MISMATCH";
      t.decisionTrace.push({
        step: "destination_validation",
        status: "FAIL",
        detail: `Expected ${t.expectedDestination}, got ${t.generatedDestination}`
      });
    }
  }
  return mismatches;
}

export function missingFromReconciliation(report: ReconciliationReport): MissingDogRecord[] {
  const rows = [...report.missing, ...report.unassigned, ...report.blocked].map((leg) => ({
    dog: leg.dogName || "unknown",
    dogId: leg.dogId,
    stage:
      leg.status === "BLOCKED_WITH_REASON"
        ? "eligibility"
        : leg.status === "UNASSIGNED"
          ? "route_assignment"
          : "validation",
    reason: leg.reason || (leg.status === "UNASSIGNED" ? "no_assignment_returned" : String(leg.status)),
    reservationId: leg.reservationId,
    direction: leg.direction
  }));
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.dog}|${row.direction}|${row.reservationId || ""}|${row.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeQualityGate(params: {
  missingCount: number;
  unexpectedCount: number;
  duplicateCount: number;
  destinationMismatchCount: number;
  addressFailCount: number;
  manualDroppedCount: number;
  warningCount: number;
}): QualityGate {
  if (
    params.missingCount ||
    params.unexpectedCount ||
    params.duplicateCount ||
    params.destinationMismatchCount ||
    params.addressFailCount ||
    params.manualDroppedCount
  ) {
    return "FAIL";
  }
  if (params.warningCount) return "PASS_WITH_WARNINGS";
  return "PASS";
}

export type PersistRouteAuditInput = {
  correlationId?: string;
  planId: string;
  reportRunId: string;
  operatingDate: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  items: NormalizedReportItem[];
  reconciliation: ReconciliationReport;
  geocodedCount: number;
  addressCount: number;
  usedSyntheticCustomerCoords: boolean;
  warnings: string[];
  startedAt: number;
  ownerTextsEnabled?: boolean;
};

export async function persistRouteGenerationAudit(
  input: PersistRouteAuditInput
): Promise<{ correlationId: string; auditId: string | null; qualityGate: QualityGate } | null> {
  const correlationId =
    input.correlationId || createRouteCorrelationId(input.operatingDate);
  try {
    const supabase = getServiceSupabase();
    const traces = buildDogDecisionTraces({
      items: input.items,
      reconciliation: input.reconciliation
    });
    const destinationMismatches = detectDestinationMismatches(traces);
    const missing = missingFromReconciliation(input.reconciliation);

    const manualRecords = input.items
      .filter((i) => itemSource(i) === "Manual")
      .map((i) => ({
        dog: i.dogName,
        service: i.serviceCanonical || i.serviceRaw,
        direction: i.direction,
        reservationId: i.reservationId
      }));

    const manualDropped = manualRecords.filter((m) =>
      missing.some(
        (miss) =>
          (m.dog && miss.dog === m.dog) ||
          (m.reservationId && miss.reservationId === m.reservationId)
      )
    );

    const uniqueDogs = new Set(
      input.items.map((i) => i.dogId || i.dogName || i.reservationId || "unknown")
    );
    const assignedDogs = new Set(
      input.reconciliation.legs
        .filter((l) => l.status === "ASSIGNED")
        .map((l) => l.dogId || l.dogName || l.reservationId || "unknown")
    );

    const addressFailCount = input.usedSyntheticCustomerCoords
      ? Math.max(0, input.addressCount - input.geocodedCount)
      : 0;

    const pipeline = buildPipelineStages({
      itemCount: input.items.length,
      recoverableCount: input.reconciliation.expectedCount - input.reconciliation.blockedCount,
      blockedCount: input.reconciliation.blockedCount,
      geocodedCount: input.geocodedCount,
      addressCount: input.addressCount,
      unassignedCount: input.reconciliation.unassignedCount,
      destinationMismatches: destinationMismatches.length,
      missingCount: missing.length,
      usedSynthetic: input.usedSyntheticCustomerCoords,
      warnings: input.warnings
    });

    const qualityGate = computeQualityGate({
      missingCount: missing.length,
      unexpectedCount: 0,
      duplicateCount: 0,
      destinationMismatchCount: destinationMismatches.length,
      addressFailCount,
      manualDroppedCount: manualDropped.length,
      warningCount: input.warnings.length + (input.usedSyntheticCustomerCoords ? 1 : 0)
    });

    const status =
      qualityGate === "FAIL" ? "failed" : qualityGate === "PASS_WITH_WARNINGS" ? "warning" : "passed";

    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - input.startedAt);

    const auditRow = {
      correlation_id: correlationId,
      plan_id: input.planId,
      report_run_id: input.reportRunId,
      operating_date: input.operatingDate.slice(0, 10),
      actor_admin_id: input.actorAdminId ?? null,
      actor_email: input.actorEmail ?? null,
      actor_role: input.actorRole ?? null,
      quality_gate: qualityGate,
      status,
      expected_dogs: uniqueDogs.size,
      generated_dogs: assignedDogs.size,
      excluded_dogs: input.reconciliation.blockedCount,
      missing_dogs: sanitizeValue(missing, { forDeveloper: false }),
      unexpected_dogs: [],
      duplicate_assignments: [],
      destination_mismatches: sanitizeValue(destinationMismatches, { forDeveloper: false }),
      manual_records: sanitizeValue(manualRecords, { forDeveloper: false }),
      pipeline_stages: pipeline,
      address_summary: {
        expected: input.addressCount,
        geocoded: input.geocodedCount,
        failed: addressFailCount,
        usedSynthetic: input.usedSyntheticCustomerCoords,
        exportReady: addressFailCount === 0
      },
      samsara_summary: { status: "pending_export" },
      owner_texts: { owner_texts_enabled: Boolean(input.ownerTextsEnabled) },
      validation_failures: sanitizeValue(
        [
          ...missing.map((m) => ({ code: "MISSING_DOG", ...m })),
          ...destinationMismatches.map((m) => ({ code: "DESTINATION_MISMATCH", ...m })),
          ...manualDropped.map((m) => ({ code: "MANUAL_RECORD_DROPPED", dog: m.dog }))
        ],
        { forDeveloper: false }
      ),
      warnings: input.warnings.slice(0, 100),
      summary_json: sanitizeValue(
        {
          legs: {
            expected: input.reconciliation.expectedCount,
            assigned: input.reconciliation.assignedCount,
            unassigned: input.reconciliation.unassignedCount,
            blocked: input.reconciliation.blockedCount,
            missing: input.reconciliation.missingCount
          }
        },
        { forDeveloper: false }
      ),
      release_version: releaseVersion(),
      environment: environment(),
      finished_at: finishedAt,
      duration_ms: durationMs,
      updated_at: finishedAt
    };

    const { data: audit, error } = await supabase
      .from("system_health_route_audits")
      .upsert(auditRow, { onConflict: "correlation_id" })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[system-health] route audit upsert failed", error.message);
      return { correlationId, auditId: null, qualityGate };
    }

    const auditId = audit?.id ? String(audit.id) : null;
    if (auditId) {
      await supabase.from("system_health_route_dog_traces").delete().eq("audit_id", auditId);
      const dogRows = traces.slice(0, 500).map((t) => ({
        audit_id: auditId,
        correlation_id: correlationId,
        dog_name: t.dogName,
        dog_id: t.dogId,
        reservation_id: t.reservationId,
        source: t.source,
        service_canonical: t.serviceCanonical,
        service_raw: t.serviceRaw,
        direction: t.direction,
        pickup_requested: t.pickupRequested,
        dropoff_requested: t.dropoffRequested,
        pickup_normalized: t.pickupNormalized,
        dropoff_normalized: t.dropoffNormalized,
        eligibility: t.eligibility,
        route_van_key: t.routeVanKey,
        route_name: t.routeName,
        generated_destination: t.generatedDestination,
        expected_destination: t.expectedDestination,
        validation_status: t.validationStatus,
        error_code: t.errorCode,
        decision_trace: t.decisionTrace,
        metadata_json: sanitizeValue(t.metadata ?? {}, { forDeveloper: false })
      }));
      if (dogRows.length) {
        const { error: dogError } = await supabase
          .from("system_health_route_dog_traces")
          .insert(dogRows);
        if (dogError) {
          console.error("[system-health] dog traces insert failed", dogError.message);
        }
      }
    }

    await emitSystemHealthEvents([
      {
        eventType: "route_generator.audit_completed",
        eventCategory: "route",
        severity: qualityGate === "FAIL" ? "error" : qualityGate === "PASS_WITH_WARNINGS" ? "warning" : "info",
        module: "route_generator",
        entityType: "route_plan",
        entityId: input.planId,
        correlationId,
        userId: input.actorAdminId,
        userEmail: input.actorEmail,
        role: input.actorRole,
        status: status,
        durationMs,
        message: `Route audit ${correlationId}: ${qualityGate} (expected ${uniqueDogs.size}, generated ${assignedDogs.size})`,
        metadata: {
          qualityGate,
          missing: missing.slice(0, 20),
          destinationMismatches: destinationMismatches.slice(0, 20)
        }
      },
      ...missing.slice(0, 30).map((m) => ({
        eventType: "route_generator.dog_missing",
        eventCategory: "route" as const,
        severity: "error" as const,
        module: "route_generator",
        correlationId,
        entityType: "dog",
        entityId: m.dogId || m.dog,
        message: `${m.dog} missing: ${m.reason}`,
        metadata: m
      }))
    ]);

    await emitSystemHealthEvent({
      eventType: "user_activity.route_generated",
      eventCategory: "user_activity",
      severity: "info",
      module: "route_generator",
      correlationId,
      userId: input.actorAdminId,
      userEmail: input.actorEmail,
      role: input.actorRole,
      entityType: "route_plan",
      entityId: input.planId,
      message: `${input.actorEmail || "User"} generated routes for ${input.operatingDate}`,
      metadata: { correlationId, qualityGate }
    });

    return { correlationId, auditId, qualityGate };
  } catch (error) {
    console.error("[system-health] persistRouteGenerationAudit exception", error);
    return { correlationId, auditId: null, qualityGate: "UNKNOWN" };
  }
}
