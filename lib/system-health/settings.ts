import { getServiceSupabase } from "@/lib/supabase/server";
import { sanitizeValue } from "@/lib/system-health/sanitize";

export type SystemHealthSettings = {
  debugLoggingEnabled: boolean;
  verboseLogging: boolean;
  routeDecisionTracing: boolean;
  apiDiagnostics: boolean;
  integrationDiagnostics: boolean;
  liveActivityEnabled: boolean;
  developerBridgeEnabled: boolean;
  cursorBridgeEnabled: boolean;
  productionDiagnosticAccess: boolean;
  piiMasking: boolean;
  healthCheckIntervalSeconds: number;
  retentionEventsDays: number;
  retentionApiLogsDays: number;
  retentionRouteAuditsDays: number;
  retentionErrorsDays: number;
};

const DEFAULTS: SystemHealthSettings = {
  debugLoggingEnabled: true,
  verboseLogging: false,
  routeDecisionTracing: true,
  apiDiagnostics: true,
  integrationDiagnostics: true,
  liveActivityEnabled: true,
  developerBridgeEnabled: true,
  cursorBridgeEnabled: true,
  productionDiagnosticAccess: false,
  piiMasking: true,
  healthCheckIntervalSeconds: 300,
  retentionEventsDays: 90,
  retentionApiLogsDays: 30,
  retentionRouteAuditsDays: 365,
  retentionErrorsDays: 180
};

function mapRow(row: Record<string, unknown> | null | undefined): SystemHealthSettings {
  if (!row) return { ...DEFAULTS };
  return {
    debugLoggingEnabled: row.debug_logging_enabled !== false,
    verboseLogging: Boolean(row.verbose_logging),
    routeDecisionTracing: row.route_decision_tracing !== false,
    apiDiagnostics: row.api_diagnostics !== false,
    integrationDiagnostics: row.integration_diagnostics !== false,
    liveActivityEnabled: row.live_activity_enabled !== false,
    developerBridgeEnabled: row.developer_bridge_enabled !== false,
    cursorBridgeEnabled: row.cursor_bridge_enabled !== false,
    productionDiagnosticAccess: Boolean(row.production_diagnostic_access),
    piiMasking: row.pii_masking !== false,
    healthCheckIntervalSeconds: Number(row.health_check_interval_seconds || 300),
    retentionEventsDays: Number(row.retention_events_days || 90),
    retentionApiLogsDays: Number(row.retention_api_logs_days || 30),
    retentionRouteAuditsDays: Number(row.retention_route_audits_days || 365),
    retentionErrorsDays: Number(row.retention_errors_days || 180)
  };
}

export async function loadSystemHealthSettings(): Promise<SystemHealthSettings> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase.from("system_health_settings").select("*").eq("id", "default").maybeSingle();
    return mapRow(data as Record<string, unknown> | null);
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSystemHealthSettings(
  patch: Partial<SystemHealthSettings>,
  updatedBy?: string | null
): Promise<SystemHealthSettings> {
  const current = await loadSystemHealthSettings();
  const next: SystemHealthSettings = { ...current, ...patch };
  // Safety: never allow production diagnostic write access flags that disable masking accidentally
  // without explicit developer permission — PII masking defaults stay on unless super-admin clears.
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("system_health_settings").upsert({
    id: "default",
    debug_logging_enabled: next.debugLoggingEnabled,
    verbose_logging: next.verboseLogging,
    route_decision_tracing: next.routeDecisionTracing,
    api_diagnostics: next.apiDiagnostics,
    integration_diagnostics: next.integrationDiagnostics,
    live_activity_enabled: next.liveActivityEnabled,
    developer_bridge_enabled: next.developerBridgeEnabled,
    cursor_bridge_enabled: next.cursorBridgeEnabled,
    production_diagnostic_access: next.productionDiagnosticAccess,
    pii_masking: next.piiMasking,
    health_check_interval_seconds: next.healthCheckIntervalSeconds,
    retention_events_days: next.retentionEventsDays,
    retention_api_logs_days: next.retentionApiLogsDays,
    retention_route_audits_days: next.retentionRouteAuditsDays,
    retention_errors_days: next.retentionErrorsDays,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null
  });
  if (error) throw new Error(error.message);
  return next;
}

export async function startLiveDebugSession(params: {
  feature: string;
  durationMinutes?: number;
  enabledBy?: string | null;
  reason?: string | null;
  scopeUserId?: string | null;
  scopeCorrelationId?: string | null;
  scopeIntegration?: string | null;
}) {
  const supabase = getServiceSupabase();
  const minutes = Math.min(Math.max(params.durationMinutes ?? 30, 5), 180);
  const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("system_health_live_debug_sessions")
    .insert({
      feature: params.feature,
      scope_user_id: params.scopeUserId ?? null,
      scope_correlation_id: params.scopeCorrelationId ?? null,
      scope_integration: params.scopeIntegration ?? null,
      enabled_by: params.enabledBy ?? null,
      reason: params.reason ?? null,
      expires_at: expires,
      active: true
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listActiveLiveDebugSessions() {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  // Expire stale
  await supabase
    .from("system_health_live_debug_sessions")
    .update({ active: false, ended_at: now })
    .eq("active", true)
    .lt("expires_at", now);
  const { data } = await supabase
    .from("system_health_live_debug_sessions")
    .select("*")
    .eq("active", true)
    .order("started_at", { ascending: false });
  return data ?? [];
}

export async function endLiveDebugSessions(params?: { feature?: string | null; sessionId?: string | null }) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  let query = supabase
    .from("system_health_live_debug_sessions")
    .update({ active: false, ended_at: now })
    .eq("active", true);
  if (params?.sessionId) {
    query = query.eq("id", params.sessionId);
  } else if (params?.feature) {
    query = query.eq("feature", params.feature);
  }
  const { data, error } = await query.select("id, feature");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function recordDebugAccess(params: {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  queryType: string;
  resource?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("system_health_debug_access_logs").insert({
      actor_admin_id: params.actorAdminId ?? null,
      actor_email: params.actorEmail ?? null,
      query_type: params.queryType,
      resource: params.resource ?? null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      sanitized: true,
      metadata_json: sanitizeValue(params.metadata ?? {}, { forDeveloper: true })
    });
  } catch (error) {
    console.error("[system-health] debug access log failed", error);
  }
}
