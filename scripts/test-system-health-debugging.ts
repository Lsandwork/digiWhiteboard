/**
 * System Health & Debugging — unit/regression tests (offline fixtures).
 * Does not require a live database.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRouteCorrelationId, isRouteCorrelationId } from "../lib/system-health/correlation";
import { sanitizeForCursor, buildAddressDiagnostic, assertNoSecrets } from "../lib/system-health/sanitize";
import { fingerprintError } from "../lib/system-health/errors";
import {
  buildPipelineStages,
  buildDogDecisionTraces,
  detectDestinationMismatches,
  missingFromReconciliation,
  computeQualityGate
} from "../lib/system-health/route-audit";
import { aggregateSystemHealth } from "../lib/system-health/health-checks";
import type { ReconciliationReport } from "../lib/route-generator/reconciliation";
import type { NormalizedReportItem } from "../lib/route-generator/parser";
import type { ServiceHealthCard } from "../lib/system-health/health-checks";

function item(partial: Partial<NormalizedReportItem> & Pick<NormalizedReportItem, "direction" | "dogName">): NormalizedReportItem {
  return {
    direction: partial.direction,
    reservationId: partial.reservationId ?? null,
    customerId: null,
    ownerFirstName: null,
    ownerLastName: null,
    ownerFullName: null,
    dogId: partial.dogId ?? null,
    dogName: partial.dogName,
    serviceRaw: partial.serviceRaw ?? "Adventure Hike",
    serviceCanonical: (partial.serviceCanonical as NormalizedReportItem["serviceCanonical"]) ?? "Adventure Hike",
    locationType: partial.locationType ?? "HOME",
    addressRaw: partial.addressRaw ?? "1 Main St",
    addressStreet: partial.addressStreet ?? "1 Main St",
    addressUnit: null,
    addressCity: "Santa Monica",
    addressState: "CA",
    addressZip: "90401",
    ownerPhoneMasked: "•••-•••-1234",
    timeWindowStart: null,
    timeWindowEnd: null,
    dogSize: null,
    specialNotes: null,
    driverNotes: null,
    reservationNotes: null,
    householdKey: partial.householdKey ?? "1 main|santa monica|ca|90401",
    validationStatus: partial.validationStatus ?? "ok",
    validationReasons: [],
    raw: (partial.raw as NormalizedReportItem["raw"]) ?? {}
  };
}

function baseReport(legs: ReconciliationReport["legs"]): ReconciliationReport {
  const missing = legs.filter((l) => l.status === "UNASSIGNED" || (l.status as string) === "MISSING");
  const unassigned = legs.filter((l) => l.status === "UNASSIGNED");
  const blocked = legs.filter((l) => l.status === "BLOCKED_WITH_REASON");
  const assigned = legs.filter((l) => l.status === "ASSIGNED");
  return {
    expectedCount: legs.length,
    assignedCount: assigned.length,
    notRequiredCount: 0,
    blockedCount: blocked.length,
    unassignedCount: unassigned.length,
    missingCount: missing.length,
    ok: missing.length === 0 && blocked.length === 0,
    legs,
    missing,
    blocked,
    unassigned
  };
}

// --- Correlation ---
{
  const id = createRouteCorrelationId("2026-08-12", 172);
  assert.equal(id, "RG-20260812-00172");
  assert.ok(isRouteCorrelationId(id));
}

// --- Sanitizer ---
{
  const dirty = {
    apiKey: "sk_live_abc",
    password: "secret",
    ownerPhone: "3105551212",
    ownerEmail: "person@example.com",
    dogName: "Baxter",
    dropoff: "FITDOG"
  };
  const clean = sanitizeForCursor(dirty) as Record<string, unknown>;
  assert.equal(clean.apiKey, "[redacted-secret]");
  assert.equal(clean.password, "[redacted-secret]");
  assert.equal(clean.ownerPhone, "•••-•••-1212");
  assert.equal(clean.ownerEmail, "[redacted-pii]");
  assert.equal(clean.dogName, "Baxter");
  assert.equal(clean.dropoff, "FITDOG");
  assertNoSecrets({ dog: "Baxter", status: "FAIL" });
  const addr = buildAddressDiagnostic({ street: "Main", city: "Santa Monica", zip: "90401", geocodeStatus: "INVALID" });
  assert.equal(addr.postal_code_present, true);
  assert.equal(addr.city, "Santa Monica");
}

// --- Error fingerprint grouping ---
{
  const a = fingerprintError("TypeError", "Cannot read properties of undefined (reading 'capacity')", "at assign (optimizer.ts:10:2)");
  const b = fingerprintError("TypeError", "Cannot read properties of undefined (reading 'capacity')", "at assign (optimizer.ts:10:2)");
  const c = fingerprintError("TypeError", "Different message", "at assign (optimizer.ts:10:2)");
  assert.equal(a, b);
  assert.notEqual(a, c);
}

// --- Missing dog / quality gate fixtures (Captain, Luna, Mattie, Oscar, Baxter) ---
{
  const items = [
    item({ direction: "pickup", dogName: "Captain", locationType: "HOME", serviceCanonical: "Adventure Hike" }),
    item({ direction: "pickup", dogName: "Luna", locationType: "HOME", serviceCanonical: "Adventure Hike" }),
    item({ direction: "pickup", dogName: "Mattie", locationType: "HOME", serviceCanonical: "Adventure Hike" }),
    item({
      direction: "pickup",
      dogName: "Oscar",
      locationType: "HOME",
      serviceCanonical: "Taxi Service",
      raw: { source: "manual", manual: "true" } as never
    }),
    item({ direction: "dropoff", dogName: "Baxter", locationType: "FITDOG", serviceCanonical: "Adventure Hike" }),
    item({ direction: "dropoff", dogName: "Atlas", locationType: "FITDOG", serviceCanonical: "Adventure Hike" })
  ];

  const legs: ReconciliationReport["legs"] = [
    {
      legId: "1",
      serviceOccurrenceId: "1",
      reservationId: null,
      dogId: null,
      dogName: "Captain",
      ownerName: null,
      serviceRaw: "Adventure Hike",
      serviceCanonical: "Adventure Hike",
      direction: "pickup",
      locationType: "HOME",
      locationLabel: "Home",
      address: "1 Main",
      source: "Gingr",
      status: "UNASSIGNED",
      reason: "no_assignment_returned",
      routeVanKey: null,
      routeName: null,
      stopId: null
    },
    {
      legId: "2",
      serviceOccurrenceId: "2",
      reservationId: null,
      dogId: null,
      dogName: "Luna",
      ownerName: null,
      serviceRaw: "Adventure Hike",
      serviceCanonical: "Adventure Hike",
      direction: "pickup",
      locationType: "HOME",
      locationLabel: "Home",
      address: "1 Main",
      source: "Gingr",
      status: "UNASSIGNED",
      reason: "capacity_assignment_null",
      routeVanKey: null,
      routeName: null,
      stopId: null
    },
    {
      legId: "3",
      serviceOccurrenceId: "3",
      reservationId: null,
      dogId: null,
      dogName: "Mattie",
      ownerName: null,
      serviceRaw: "Adventure Hike",
      serviceCanonical: "Adventure Hike",
      direction: "pickup",
      locationType: "HOME",
      locationLabel: "Home",
      address: "1 Main",
      source: "Gingr",
      status: "BLOCKED_WITH_REASON",
      reason: "unexpected_false",
      routeVanKey: null,
      routeName: null,
      stopId: null
    },
    {
      legId: "4",
      serviceOccurrenceId: "4",
      reservationId: null,
      dogId: null,
      dogName: "Oscar",
      ownerName: null,
      serviceRaw: "Taxi Service",
      serviceCanonical: "Taxi Service",
      direction: "pickup",
      locationType: "HOME",
      locationLabel: "Home",
      address: "1 Main",
      source: "Manual",
      status: "UNASSIGNED",
      reason: "manual_record_dropped",
      routeVanKey: null,
      routeName: null,
      stopId: null
    },
    {
      legId: "5",
      serviceOccurrenceId: "5",
      reservationId: null,
      dogId: null,
      dogName: "Baxter",
      ownerName: null,
      serviceRaw: "Adventure Hike",
      serviceCanonical: "Adventure Hike",
      direction: "dropoff",
      locationType: "FITDOG",
      locationLabel: "Fitdog",
      address: "Hub",
      source: "Gingr",
      status: "ASSIGNED",
      reason: null,
      routeVanKey: "van_1",
      routeName: "Hike Van 1",
      stopId: "s1"
    },
    {
      legId: "6",
      serviceOccurrenceId: "6",
      reservationId: null,
      dogId: null,
      dogName: "Atlas",
      ownerName: null,
      serviceRaw: "Adventure Hike",
      serviceCanonical: "Adventure Hike",
      direction: "dropoff",
      locationType: "FITDOG",
      locationLabel: "Fitdog",
      address: "Hub",
      source: "Gingr",
      status: "ASSIGNED",
      reason: null,
      routeVanKey: "van_1",
      routeName: "Hike Van 1",
      stopId: "s2"
    }
  ];

  const report = baseReport(legs);
  const missing = missingFromReconciliation(report);
  assert.ok(missing.some((m) => m.dog === "Captain"));
  assert.ok(missing.some((m) => m.dog === "Luna"));
  assert.ok(missing.some((m) => m.dog === "Mattie"));
  assert.ok(missing.some((m) => m.dog === "Oscar"));

  const traces = buildDogDecisionTraces({ items, reconciliation: report });
  // Simulate destination mismatch for Baxter (resolver returned HOME)
  const baxter = traces.find((t) => t.dogName === "Baxter");
  assert.ok(baxter);
  baxter!.generatedDestination = "HOME";
  baxter!.expectedDestination = "FITDOG";
  const mismatches = detectDestinationMismatches(traces);
  assert.ok(mismatches.some((m) => m.dog === "Baxter" && m.expected === "FITDOG" && m.actual === "HOME"));
  assert.equal(baxter!.errorCode, "DESTINATION_MISMATCH");

  const atlas = traces.find((t) => t.dogName === "Atlas");
  assert.ok(atlas);
  assert.equal(atlas!.expectedDestination, "FITDOG");
  assert.equal(atlas!.generatedDestination, "FITDOG");

  const gate = computeQualityGate({
    missingCount: missing.length,
    unexpectedCount: 0,
    duplicateCount: 0,
    destinationMismatchCount: mismatches.length,
    addressFailCount: 0,
    manualDroppedCount: 1,
    warningCount: 0
  });
  assert.equal(gate, "FAIL");

  // Invariant: every dog accounted for (assigned + missing/blocked)
  const accounted = report.assignedCount + report.unassignedCount + report.blockedCount;
  assert.equal(accounted, report.expectedCount);

  const pipeline = buildPipelineStages({
    itemCount: items.length,
    recoverableCount: items.length - 1,
    blockedCount: 1,
    geocodedCount: 4,
    addressCount: 5,
    unassignedCount: report.unassignedCount,
    destinationMismatches: mismatches.length,
    missingCount: missing.length,
    usedSynthetic: false,
    warnings: ["OVERFLOW"]
  });
  assert.equal(pipeline.find((s) => s.key === "validation")?.status, "FAIL");
  assert.equal(pipeline.find((s) => s.key === "route_assignment")?.status, "FAIL");
}

// --- Aggregate health (critical services only) ---
{
  const base: Omit<ServiceHealthCard, "id" | "label" | "status"> = {
    responseTimeMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    errorsLastHour: 0,
    errorsLast24h: 0,
    successRate24h: null,
    detail: ""
  };
  const healthy = aggregateSystemHealth([
    { id: "database", label: "Database", status: "HEALTHY", ...base },
    { id: "email", label: "Email", status: "WARNING", ...base },
    { id: "storage", label: "Storage", status: "HEALTHY", ...base }
  ]);
  assert.equal(healthy, "HEALTHY");

  const degraded = aggregateSystemHealth([
    { id: "database", label: "Database", status: "HEALTHY", ...base },
    { id: "job_queue", label: "Job Queue", status: "DEGRADED", ...base },
    { id: "email", label: "Email", status: "FAILED", ...base }
  ]);
  assert.equal(degraded, "DEGRADED");
}

// --- Wiring / navigation / permissions / probes presence ---
{
  const nav = readFileSync(resolve(__dirname, "../lib/admin/nav-groups.ts"), "utf8");
  assert.ok(nav.includes("includeSystemHealth"));
  assert.ok(nav.includes("System Health & Debugging"));
  assert.ok(nav.includes('leaf("ops_system_health")'));

  const perms = readFileSync(resolve(__dirname, "../lib/admin/permissions.ts"), "utf8");
  for (const key of [
    "system_health.view",
    "system_health.errors",
    "system_health.integrations",
    "system_health.route_audits",
    "system_health.user_activity",
    "system_health.developer",
    "system_health.export",
    "system_health.configure"
  ]) {
    assert.ok(perms.includes(`"${key}"`), `missing permission ${key}`);
  }

  const service = readFileSync(resolve(__dirname, "../lib/route-generator/service.ts"), "utf8");
  assert.ok(service.includes("persistRouteGenerationAudit"));
  assert.ok(service.includes("createRouteCorrelationId"));

  const pkg = readFileSync(resolve(__dirname, "../package.json"), "utf8");
  assert.ok(pkg.includes("ruffops:debug"));
  assert.ok(pkg.includes("test:system-health"));

  const dashboard = readFileSync(resolve(__dirname, "../components/admin/AdminDashboard.tsx"), "utf8");
  assert.ok(dashboard.includes("SystemHealthDebuggingApp"));

  const health = readFileSync(resolve(__dirname, "../lib/system-health/health-checks.ts"), "utf8");
  assert.ok(health.includes("probeCloudStorage"));
  assert.ok(health.includes("probeRealtime"));
  assert.ok(health.includes("probeBackgroundWorker"));
  assert.ok(health.includes("probeJobQueue"));
  assert.ok(health.includes("probeRouteGenerator"));
  assert.ok(health.includes("aggregateSystemHealth"));

  const storage = readFileSync(resolve(__dirname, "../lib/system-health/probes/storage.ts"), "utf8");
  assert.ok(storage.includes("PHOTO_UPLOAD_BUCKET"));
  assert.ok(storage.includes("CAST_TV_BUCKET"));

  const ui = readFileSync(
    resolve(__dirname, "../components/admin/system-health/SystemHealthDebuggingApp.tsx"),
    "utf8"
  );
  assert.ok(ui.includes('id: "storage"'));
  assert.ok(ui.includes("Re-probe buckets"));
  assert.ok(ui.includes("Failed today"));
  assert.ok(ui.includes("Apply migration 072"));

  const ensure = readFileSync(resolve(__dirname, "../lib/system-health/ensure-schema.ts"), "utf8");
  assert.ok(ensure.includes("072_system_health_debugging.sql"));
  assert.ok(ensure.includes("system_health_route_audits"));

  const routeProbe = readFileSync(
    resolve(__dirname, "../lib/system-health/probes/route-generator.ts"),
    "utf8"
  );
  assert.ok(routeProbe.includes("HEALTHY_PLAN_STATUSES"));
  assert.ok(routeProbe.includes("needs_review"));
  assert.ok(!routeProbe.includes('st === "needs_review" || st === "generating") {\n        status = "WARNING"'));

  const realtimeProbeSrc = readFileSync(
    resolve(__dirname, "../lib/system-health/probes/realtime.ts"),
    "utf8"
  );
  assert.ok(realtimeProbeSrc.includes("loadBoardFreshest"));
  assert.ok(realtimeProbeSrc.includes("last_seen_from_gingr_at"));
}

console.log("test-system-health-debugging: ok");
