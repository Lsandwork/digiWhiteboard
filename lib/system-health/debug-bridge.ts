/**
 * Cursor Debug Bridge — read-only diagnostic queries.
 * Never mutates production data. Always sanitizes for developer output.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { runFunctionalHealthChecks } from "@/lib/system-health/health-checks";
import { sanitizeForCursor, assertNoSecrets } from "@/lib/system-health/sanitize";
import { recordDebugAccess, loadSystemHealthSettings } from "@/lib/system-health/settings";
import { isRouteCorrelationId } from "@/lib/system-health/correlation";

export type DebugBridgeActor = {
  adminId?: string | null;
  email?: string | null;
};

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function ensureBridgeAllowed(actor?: DebugBridgeActor) {
  let settings;
  try {
    settings = await loadSystemHealthSettings();
  } catch {
    settings = await loadSystemHealthSettings();
  }
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const isProd = env === "production";
  if (isProd) {
    if (!settings.developerBridgeEnabled && !settings.cursorBridgeEnabled) {
      throw new Error("Developer/Cursor debug bridge is disabled in System Health settings.");
    }
    if (!settings.productionDiagnosticAccess && process.env.RUFFOPS_DEBUG_ALLOW_PRODUCTION !== "true") {
      throw new Error(
        "Production diagnostic access is disabled. Enable it in System Health Settings or set RUFFOPS_DEBUG_ALLOW_PRODUCTION=true for read-only access."
      );
    }
  }
  await recordDebugAccess({
    actorAdminId: actor?.adminId,
    actorEmail: actor?.email,
    queryType: "bridge_access",
    resource: "gate"
  });
  return settings;
}

export async function debugHealth(actor?: DebugBridgeActor) {
  await ensureBridgeAllowed(actor);
  const result = await runFunctionalHealthChecks();
  const payload = sanitizeForCursor(result);
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: actor?.adminId,
    actorEmail: actor?.email,
    queryType: "health",
    resource: "overview"
  });
  return payload;
}

export async function debugRouteRun(correlationId: string, actor?: DebugBridgeActor) {
  await ensureBridgeAllowed(actor);
  const supabase = getServiceSupabase();
  const id = String(correlationId || "").trim();
  const { data: audit } = await supabase
    .from("system_health_route_audits")
    .select("*")
    .eq("correlation_id", id)
    .maybeSingle();
  if (!audit) {
    return sanitizeForCursor({ routeRun: id, status: "not_found", message: "No route audit for correlation ID." });
  }
  const { data: traces } = await supabase
    .from("system_health_route_dog_traces")
    .select("*")
    .eq("correlation_id", id)
    .order("dog_name");
  const { data: events } = await supabase
    .from("system_health_events")
    .select("event_type, severity, occurred_at, message, status, module")
    .eq("correlation_id", id)
    .order("occurred_at", { ascending: true })
    .limit(200);

  const missing = (audit.missing_dogs as Array<Record<string, unknown>>) || [];
  const payload = sanitizeForCursor({
    routeRun: id,
    status: audit.status,
    qualityGate: audit.quality_gate,
    operatingDate: audit.operating_date,
    expectedDogs: audit.expected_dogs,
    generatedDogs: audit.generated_dogs,
    excludedDogs: audit.excluded_dogs,
    missingDogs: missing,
    unexpectedDogs: audit.unexpected_dogs,
    destinationMismatches: audit.destination_mismatches,
    manualRecords: audit.manual_records,
    pipeline: audit.pipeline_stages,
    addressSummary: audit.address_summary,
    validationFailures: audit.validation_failures,
    warnings: audit.warnings,
    durationMs: audit.duration_ms,
    releaseVersion: audit.release_version,
    environment: audit.environment,
    dogTraces: (traces ?? []).map((t) => ({
      dog: t.dog_name,
      dogId: t.dog_id,
      source: t.source,
      service: t.service_canonical || t.service_raw,
      direction: t.direction,
      expected: t.expected_destination,
      generated: t.generated_destination,
      eligibility: t.eligibility,
      route: t.route_van_key,
      validation: t.validation_status,
      errorCode: t.error_code,
      decisionTrace: t.decision_trace
    })),
    timeline: events ?? []
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: actor?.adminId,
    actorEmail: actor?.email,
    queryType: "route-run",
    resource: id
  });
  return payload;
}

export async function debugDog(params: {
  dog: string;
  date?: string;
  actor?: DebugBridgeActor;
}) {
  await ensureBridgeAllowed(params.actor);
  const supabase = getServiceSupabase();
  const dog = String(params.dog || "").trim();
  let query = supabase
    .from("system_health_route_dog_traces")
    .select("*, system_health_route_audits!inner(operating_date, quality_gate, status, correlation_id)")
    .ilike("dog_name", dog)
    .order("created_at", { ascending: false })
    .limit(50);
  // PostgREST nested filter for date when provided
  if (params.date) {
    const { data: audits } = await supabase
      .from("system_health_route_audits")
      .select("correlation_id")
      .eq("operating_date", params.date.slice(0, 10))
      .limit(100);
    const ids = (audits ?? []).map((a) => a.correlation_id);
    if (!ids.length) {
      return sanitizeForCursor({ dog, date: params.date, traces: [], message: "No audits for date." });
    }
    query = supabase
      .from("system_health_route_dog_traces")
      .select("*")
      .ilike("dog_name", dog)
      .in("correlation_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);
  }
  const { data } = await query;
  const payload = sanitizeForCursor({
    dog,
    date: params.date || null,
    traces: data ?? []
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: params.actor?.adminId,
    actorEmail: params.actor?.email,
    queryType: "dog",
    resource: dog
  });
  return payload;
}

export async function debugErrors(params: { lastHours?: number; actor?: DebugBridgeActor }) {
  await ensureBridgeAllowed(params.actor);
  const since = hoursAgoIso(params.lastHours ?? 1);
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("system_health_errors")
    .select(
      "id, fingerprint, error_type, error_message, severity, application_module, occurrence_count, first_occurrence_at, last_occurrence_at, status, correlation_id, affected_operation, release_version"
    )
    .gte("last_occurrence_at", since)
    .order("last_occurrence_at", { ascending: false })
    .limit(100);
  const payload = sanitizeForCursor({ since, errors: data ?? [] });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: params.actor?.adminId,
    actorEmail: params.actor?.email,
    queryType: "errors",
    resource: `last_${params.lastHours ?? 1}h`
  });
  return payload;
}

export async function debugIntegration(params: {
  integration: string;
  lastHours?: number;
  actor?: DebugBridgeActor;
}) {
  await ensureBridgeAllowed(params.actor);
  const since = hoursAgoIso(params.lastHours ?? 24);
  const supabase = getServiceSupabase();
  const integration = String(params.integration || "").toLowerCase();
  const { data } = await supabase
    .from("system_health_integration_calls")
    .select(
      "id, integration, action, status, http_status, latency_ms, success, correlation_id, feature, record_count, error_code, error_message, occurred_at"
    )
    .eq("integration", integration)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(100);
  const failures = (data ?? []).filter((r) => r.success === false);
  const payload = sanitizeForCursor({
    integration,
    since,
    calls: data ?? [],
    failureCount: failures.length
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: params.actor?.adminId,
    actorEmail: params.actor?.email,
    queryType: "integration",
    resource: integration
  });
  return payload;
}

export async function debugSearch(params: { query: string; actor?: DebugBridgeActor }) {
  await ensureBridgeAllowed(params.actor);
  const q = String(params.query || "").trim();
  const supabase = getServiceSupabase();

  if (isRouteCorrelationId(q)) {
    return debugRouteRun(q, params.actor);
  }

  const [audits, errors, events, traces] = await Promise.all([
    supabase
      .from("system_health_route_audits")
      .select("correlation_id, operating_date, status, quality_gate, expected_dogs, generated_dogs, started_at")
      .or(`correlation_id.ilike.%${q}%,actor_email.ilike.%${q}%`)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("system_health_errors")
      .select("id, error_message, severity, status, last_occurrence_at, correlation_id, application_module")
      .or(`error_message.ilike.%${q}%,correlation_id.ilike.%${q}%,id.eq.${q}`)
      .order("last_occurrence_at", { ascending: false })
      .limit(20),
    supabase
      .from("system_health_events")
      .select("id, event_type, severity, message, correlation_id, occurred_at, module")
      .or(`message.ilike.%${q}%,correlation_id.ilike.%${q}%,entity_id.ilike.%${q}%`)
      .order("occurred_at", { ascending: false })
      .limit(30),
    supabase
      .from("system_health_route_dog_traces")
      .select("dog_name, correlation_id, validation_status, error_code, expected_destination, generated_destination, service_canonical")
      .ilike("dog_name", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  const payload = sanitizeForCursor({
    query: q,
    routeAudits: audits.data ?? [],
    errors: errors.data ?? [],
    events: events.data ?? [],
    dogTraces: traces.data ?? []
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: params.actor?.adminId,
    actorEmail: params.actor?.email,
    queryType: "search",
    resource: q.slice(0, 80)
  });
  return payload;
}

export async function debugFeatureContext(params: {
  feature: string;
  lastHours?: number;
  actor?: DebugBridgeActor;
}) {
  await ensureBridgeAllowed(params.actor);
  const hours = params.lastHours ?? 24;
  const since = hoursAgoIso(hours);
  const feature = String(params.feature || "").toLowerCase();
  const supabase = getServiceSupabase();

  const moduleFilter =
    feature.includes("route") ? "route_generator" : feature.includes("gingr") ? "gingr" : feature;

  const [audits, errors, events, integ] = await Promise.all([
    supabase
      .from("system_health_route_audits")
      .select("*")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("system_health_errors")
      .select("id, error_type, error_message, severity, occurrence_count, correlation_id, application_module, last_occurrence_at")
      .gte("last_occurrence_at", since)
      .or(`application_module.ilike.%${moduleFilter}%,affected_operation.ilike.%${feature}%`)
      .order("last_occurrence_at", { ascending: false })
      .limit(40),
    supabase
      .from("system_health_events")
      .select("event_type, severity, message, correlation_id, occurred_at")
      .gte("occurred_at", since)
      .eq("severity", "warning")
      .order("occurred_at", { ascending: false })
      .limit(40),
    supabase
      .from("system_health_integration_calls")
      .select("*")
      .eq("success", false)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(40)
  ]);

  const auditRows = audits.data ?? [];
  const passed = auditRows.filter((a) => a.quality_gate === "PASS").length;
  const warned = auditRows.filter((a) => a.quality_gate === "PASS_WITH_WARNINGS").length;
  const failed = auditRows.filter((a) => a.quality_gate === "FAIL").length;

  const failureCodes: Record<string, number> = {};
  const affectedDogs = new Set<string>();
  for (const a of auditRows) {
    for (const m of (a.missing_dogs as Array<{ dog?: string; reason?: string }>) || []) {
      if (m.dog) affectedDogs.add(m.dog);
      const code = m.reason || "MISSING";
      failureCodes[code] = (failureCodes[code] || 0) + 1;
    }
    for (const m of (a.destination_mismatches as Array<{ dog?: string }>) || []) {
      if (m.dog) affectedDogs.add(m.dog);
      failureCodes.DESTINATION_MISMATCH = (failureCodes.DESTINATION_MISMATCH || 0) + 1;
    }
    for (const v of (a.validation_failures as Array<{ code?: string; dog?: string }>) || []) {
      if (v.code) failureCodes[v.code] = (failureCodes[v.code] || 0) + 1;
      if (v.dog) affectedDogs.add(String(v.dog));
    }
  }

  const primaryFailures = Object.entries(failureCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => `${code}: ${count}`);

  const payload = sanitizeForCursor({
    feature: params.feature,
    lastHours: hours,
    routeRuns: auditRows.length,
    passed,
    warning: warned,
    failed,
    primaryFailures,
    recentAffectedDogs: [...affectedDogs].slice(0, 30),
    relatedCorrelationIds: auditRows
      .filter((a) => a.quality_gate === "FAIL" || a.status === "failed")
      .map((a) => a.correlation_id)
      .slice(0, 20),
    recentErrors: errors.data ?? [],
    recentWarnings: events.data ?? [],
    integrationFailures: integ.data ?? [],
    releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: params.actor?.adminId,
    actorEmail: params.actor?.email,
    queryType: "context",
    resource: feature
  });
  return payload;
}

export async function debugBugBundle(correlationId: string, actor?: DebugBridgeActor) {
  await ensureBridgeAllowed(actor);
  const route = (await debugRouteRun(correlationId, actor)) as Record<string, unknown>;
  const supabase = getServiceSupabase();
  const { data: apiLogs } = await supabase
    .from("system_health_api_logs")
    .select("method, endpoint, status_code, latency_ms, occurred_at, feature")
    .eq("correlation_id", correlationId)
    .order("occurred_at", { ascending: true })
    .limit(50);
  const { data: integ } = await supabase
    .from("system_health_integration_calls")
    .select("integration, action, success, latency_ms, error_message, occurred_at")
    .eq("correlation_id", correlationId)
    .order("occurred_at", { ascending: true })
    .limit(50);
  const { data: errors } = await supabase
    .from("system_health_errors")
    .select("id, error_type, error_message, severity, occurrence_count, status, stack_trace")
    .eq("correlation_id", correlationId)
    .limit(20);

  const payload = sanitizeForCursor({
    bundleType: "bug_context",
    correlationId,
    ...route,
    apiCalls: apiLogs ?? [],
    integrationCalls: integ ?? [],
    errors: (errors ?? []).map((e) => ({
      ...e,
      stack_trace: e.stack_trace ? String(e.stack_trace).split("\n").slice(0, 12).join("\n") : null
    })),
    cursorCommand: `npm run ruffops:debug -- bug ${correlationId}`
  });
  assertNoSecrets(payload);
  await recordDebugAccess({
    actorAdminId: actor?.adminId,
    actorEmail: actor?.email,
    queryType: "bug",
    resource: correlationId
  });
  return payload;
}

export function formatDebugContextText(bundle: Record<string, unknown>): string {
  const lines = [
    "RUFFOPS DEBUG CONTEXT",
    "",
    `Feature: ${bundle.feature || "Route Generator"}`,
    `Correlation: ${bundle.correlationId || bundle.routeRun || ""}`,
    `Environment: ${bundle.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || ""}`,
    `Build: ${bundle.releaseVersion || ""}`,
    "",
    `Status: ${bundle.status || ""}`,
    `Quality: ${bundle.qualityGate || ""}`,
    `Expected dogs: ${bundle.expectedDogs ?? ""}`,
    `Generated: ${bundle.generatedDogs ?? ""}`,
    ""
  ];
  const missing = (bundle.missingDogs as Array<{ dog?: string; reason?: string }>) || [];
  if (missing.length) {
    lines.push("Missing:");
    for (const m of missing) lines.push(`- ${m.dog}: ${m.reason || ""}`);
    lines.push("");
  }
  const mismatches = (bundle.destinationMismatches as Array<{ dog?: string; expected?: string; actual?: string }>) || [];
  if (mismatches.length) {
    lines.push("Destination mismatches:");
    for (const m of mismatches) lines.push(`- ${m.dog}: expected ${m.expected}, actual ${m.actual}`);
    lines.push("");
  }
  if (bundle.cursorCommand) {
    lines.push(`Cursor command: ${bundle.cursorCommand}`);
  }
  return lines.join("\n");
}
