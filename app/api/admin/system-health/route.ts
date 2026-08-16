import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  accessFromLegacyRole,
  hasPermission,
  type PermissionKey
} from "@/lib/admin/permissions";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import {
  loadSystemHealthDashboardBundle,
  loadLiveActivity,
  loadErrors,
  loadRouteAudits,
  loadRouteAuditDetail,
  loadIntegrationCalls,
  loadApiLogs,
  loadBackgroundJobs,
  loadStorageHealth,
  loadUserActivity
} from "@/lib/system-health/dashboard";
import {
  saveSystemHealthSettings,
  startLiveDebugSession,
  endLiveDebugSessions,
  loadSystemHealthSettings
} from "@/lib/system-health/settings";
import { runSystemHealthAudit } from "@/lib/admin/system-health-audit";
import { updateErrorStatus } from "@/lib/system-health/errors";
import {
  debugSearch,
  debugBugBundle,
  debugFeatureContext,
  formatDebugContextText
} from "@/lib/system-health/debug-bridge";
import { recordApiLog } from "@/lib/system-health/integrations";
import { createRequestId } from "@/lib/system-health/correlation";
import {
  applySystemHealthMigration072,
  checkSystemHealthSchema,
  loadSystemHealthMigrationSql
} from "@/lib/system-health/ensure-schema";

export const dynamic = "force-dynamic";

async function requireSystemHealth(
  request: Request,
  permission: PermissionKey = "system_health.view"
) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  const access =
    (await getUserAccess(supabase, session.adminUserId, session.role, session.email)) ??
    accessFromLegacyRole(null, session.email, session.role);

  const elevated: PermissionKey[] = [
    "system_health.developer",
    "system_health.configure",
    "system_health.export"
  ];
  const allowed =
    hasPermission(access, permission) ||
    (!elevated.includes(permission) && hasPermission(access, "system_health.view"));
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, access };
}

export async function GET(request: Request) {
  const started = Date.now();
  const requestId = createRequestId();
  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "dashboard";

  const needed: PermissionKey =
    view === "settings"
      ? "system_health.configure"
      : view.startsWith("route")
        ? "system_health.route_audits"
        : view === "errors"
          ? "system_health.errors"
          : view === "integrations"
            ? "system_health.integrations"
            : "system_health.view";

  const auth = await requireSystemHealth(request, needed);
  if ("error" in auth && auth.error) return auth.error;

  try {
    let payload: unknown;
    switch (view) {
      case "dashboard":
        payload = await loadSystemHealthDashboardBundle();
        break;
      case "events":
      case "live":
        payload = {
          data: await loadLiveActivity({
            limit: Number(url.searchParams.get("limit") || 100),
            severity: url.searchParams.get("severity") || undefined,
            correlationId: url.searchParams.get("correlationId") || undefined
          })
        };
        break;
      case "errors":
        payload = {
          data: await loadErrors({
            status: url.searchParams.get("status") || undefined,
            limit: Number(url.searchParams.get("limit") || 100)
          })
        };
        break;
      case "route_audits":
        payload = {
          data: await loadRouteAudits({
            status: url.searchParams.get("status") || undefined,
            limit: Number(url.searchParams.get("limit") || 50)
          })
        };
        break;
      case "route_audit": {
        const correlationId = url.searchParams.get("correlationId");
        if (!correlationId) {
          return NextResponse.json({ error: "correlationId required" }, { status: 400 });
        }
        payload = { data: await loadRouteAuditDetail(correlationId) };
        break;
      }
      case "integrations":
        payload = {
          data: await loadIntegrationCalls({
            integration: url.searchParams.get("integration") || undefined,
            limit: Number(url.searchParams.get("limit") || 100)
          })
        };
        break;
      case "api_logs":
        payload = { data: await loadApiLogs({ limit: Number(url.searchParams.get("limit") || 100) }) };
        break;
      case "jobs":
        payload = {
          data: await loadBackgroundJobs({
            limit: Number(url.searchParams.get("limit") || 50),
            status: url.searchParams.get("status") || undefined
          })
        };
        break;
      case "storage":
        payload = { data: await loadStorageHealth() };
        break;
      case "user_activity":
        payload = {
          data: await loadUserActivity({
            limit: Number(url.searchParams.get("limit") || 100)
          })
        };
        break;
      case "schema": {
        const supabase = getServiceSupabase();
        payload = { data: await checkSystemHealthSchema(supabase) };
        break;
      }
      case "migration_sql":
        payload = {
          data: {
            file: "072_system_health_debugging.sql",
            sql: loadSystemHealthMigrationSql()
          }
        };
        break;
      case "settings":
        payload = { settings: await loadSystemHealthSettings() };
        break;
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }

    void recordApiLog({
      method: "GET",
      endpoint: "/api/admin/system-health",
      statusCode: 200,
      latencyMs: Date.now() - started,
      userId: auth.session?.adminUserId,
      userEmail: auth.session?.email,
      requestId,
      feature: "system_health",
      metadata: { view }
    });

    return NextResponse.json(payload);
  } catch (error) {
    void recordApiLog({
      method: "GET",
      endpoint: "/api/admin/system-health",
      statusCode: 500,
      latencyMs: Date.now() - started,
      userId: auth.session?.adminUserId,
      userEmail: auth.session?.email,
      requestId,
      feature: "system_health",
      metadata: { view, error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "System Health error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const started = Date.now();
  const requestId = createRequestId();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  const permission: PermissionKey =
    action === "save_settings" ||
    action === "start_live_debug" ||
    action === "end_live_debug" ||
    action === "apply_migration_072" ||
    action === "run_whiteboard_audit"
      ? "system_health.configure"
      : action === "bug_context" || action === "search" || action === "context"
        ? "system_health.developer"
        : action.startsWith("error")
          ? "system_health.errors"
          : "system_health.view";

  const auth = await requireSystemHealth(request, permission);
  if ("error" in auth && auth.error) return auth.error;

  try {
    switch (action) {
      case "save_settings": {
        const raw = (body.settings as Record<string, unknown>) || {};
        const settings = await saveSystemHealthSettings(
          {
            debugLoggingEnabled: raw.debugLoggingEnabled as boolean | undefined,
            verboseLogging: raw.verboseLogging as boolean | undefined,
            routeDecisionTracing: raw.routeDecisionTracing as boolean | undefined,
            apiDiagnostics: raw.apiDiagnostics as boolean | undefined,
            integrationDiagnostics: raw.integrationDiagnostics as boolean | undefined,
            liveActivityEnabled: raw.liveActivityEnabled as boolean | undefined,
            developerBridgeEnabled: raw.developerBridgeEnabled as boolean | undefined,
            cursorBridgeEnabled: raw.cursorBridgeEnabled as boolean | undefined,
            productionDiagnosticAccess: raw.productionDiagnosticAccess as boolean | undefined,
            piiMasking: raw.piiMasking as boolean | undefined,
            healthCheckIntervalSeconds: raw.healthCheckIntervalSeconds as number | undefined,
            retentionEventsDays: raw.retentionEventsDays as number | undefined,
            retentionApiLogsDays: raw.retentionApiLogsDays as number | undefined,
            retentionRouteAuditsDays: raw.retentionRouteAuditsDays as number | undefined,
            retentionErrorsDays: raw.retentionErrorsDays as number | undefined
          },
          auth.session?.adminUserId
        );
        return NextResponse.json({ ok: true, settings });
      }
      case "start_live_debug": {
        const session = await startLiveDebugSession({
          feature: String(body.feature || "route_generator"),
          durationMinutes: Number(body.durationMinutes || 30),
          enabledBy: auth.session?.adminUserId,
          reason: body.reason ? String(body.reason) : null,
          scopeCorrelationId: body.correlationId ? String(body.correlationId) : null,
          scopeIntegration: body.integration ? String(body.integration) : null
        });
        return NextResponse.json({ ok: true, session });
      }
      case "end_live_debug": {
        const ended = await endLiveDebugSessions({
          feature: body.feature ? String(body.feature) : null,
          sessionId: body.sessionId ? String(body.sessionId) : null
        });
        return NextResponse.json({ ok: true, ended: ended.length, sessions: ended });
      }
      case "run_whiteboard_audit": {
        const state = await runSystemHealthAudit(getServiceSupabase(), {
          trigger: "manual",
          autoFix: body.auto_fix !== false
        });
        const latest = state.runs[0];
        return NextResponse.json({
          ok: true,
          overall_status: state.overall_status,
          open_issues: state.open_issues.length,
          summary: latest?.summary ?? null
        });
      }
      case "apply_migration_072": {
        const before = await checkSystemHealthSchema(getServiceSupabase());
        if (before.ready) {
          return NextResponse.json({
            ok: true,
            applied: false,
            alreadyReady: true,
            schema: before,
            detail: "Migration 072 already applied — all System Health tables present."
          });
        }
        const result = await applySystemHealthMigration072();
        const after = await checkSystemHealthSchema(getServiceSupabase());
        return NextResponse.json({
          ...result,
          ok: result.ok && after.ready,
          schema: after
        });
      }
      case "resolve_error":
      case "reopen_error":
      case "assign_error": {
        await updateErrorStatus({
          errorId: String(body.errorId || ""),
          status: action === "reopen_error" ? "unresolved" : action === "resolve_error" ? "resolved" : "unresolved",
          actorAdminId: auth.session?.adminUserId,
          notes: body.notes ? String(body.notes) : null,
          assignTo: body.assignTo ? String(body.assignTo) : undefined
        });
        return NextResponse.json({ ok: true });
      }
      case "search": {
        const data = await debugSearch({
          query: String(body.query || ""),
          actor: { adminId: auth.session?.adminUserId, email: auth.session?.email }
        });
        return NextResponse.json({ data });
      }
      case "context": {
        const data = await debugFeatureContext({
          feature: String(body.feature || "route-generator"),
          lastHours: Number(body.lastHours || 24),
          actor: { adminId: auth.session?.adminUserId, email: auth.session?.email }
        });
        return NextResponse.json({ data });
      }
      case "bug_context": {
        const correlationId = String(body.correlationId || "");
        const data = (await debugBugBundle(correlationId, {
          adminId: auth.session?.adminUserId,
          email: auth.session?.email
        })) as Record<string, unknown>;
        return NextResponse.json({
          data,
          text: formatDebugContextText(data)
        });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    void recordApiLog({
      method: "POST",
      endpoint: "/api/admin/system-health",
      statusCode: 500,
      latencyMs: Date.now() - started,
      userId: auth.session?.adminUserId,
      userEmail: auth.session?.email,
      requestId,
      feature: "system_health",
      metadata: { action, error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "System Health error" },
      { status: 500 }
    );
  }
}
