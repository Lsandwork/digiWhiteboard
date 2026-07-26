import { NextResponse } from "next/server";
import { blockDemoWrite, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canUseRouteGenerator, hasRoutePermission } from "@/lib/route-generator/access";
import { isRouteGeneratorEnabled } from "@/lib/route-generator/flags";
import {
  addTaxiToReportRun,
  assignSkippedOccurrence,
  approvePlan,
  exportSamsaraCsv,
  generatePlanForRun,
  getPlanBundle,
  getReportRun,
  getRouteGeneratorBootstrap,
  pullReportForDate
} from "@/lib/route-generator/service";
import { listGingrTaxiServicesByDate } from "@/lib/route-generator/gingr-taxi";
import { writeRouteAuditEvent } from "@/lib/route-generator/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAccess(request: Request, permission: Parameters<typeof hasRoutePermission>[1]) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canUseRouteGenerator(access) || !hasRoutePermission(access, permission)) {
    return {
      error: NextResponse.json({ error: "You do not have access to Route Generator." }, { status: 403 })
    };
  }

  // Flag off = shadow/setup mode still available to authorized roles; production enablement is a separate checklist.
  void isRouteGeneratorEnabled;

  return { session, access };
}

export async function GET(request: Request) {
  const gate = await requireAccess(request, "route_generator.view");
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "bootstrap";
  const planId = url.searchParams.get("planId");

  try {
    if (view === "plan" && planId) {
      const bundle = await getPlanBundle(planId);
      return NextResponse.json(bundle);
    }
    if (view === "report_run") {
      const reportRunId = url.searchParams.get("reportRunId");
      if (!reportRunId) {
        return NextResponse.json({ error: "reportRunId is required." }, { status: 400 });
      }
      const report = await getReportRun(reportRunId);
      return NextResponse.json(report);
    }
    if (view === "gingr_taxi") {
      const date = url.searchParams.get("date") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Select a valid operating date (YYYY-MM-DD)." }, { status: 400 });
      }
      const taxi = await listGingrTaxiServicesByDate(date);
      return NextResponse.json(taxi);
    }
    if (view === "audit") {
      const auditGate = await requireAccess(request, "route_generator.view_audit");
      if ("error" in auditGate && auditGate.error) return auditGate.error;
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("route_audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return NextResponse.json({ events: data ?? [] });
    }
    const bootstrap = await getRouteGeneratorBootstrap();
    return NextResponse.json({
      ...bootstrap,
      featureEnabled: isRouteGeneratorEnabled()
    });
  } catch (error) {
    console.error("[route-generator] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Route Generator." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const permission =
    action === "pull_report" ||
    action === "assign_skipped_occurrence" ||
    action === "add_taxi" ||
    action === "list_gingr_taxi"
      ? "route_generator.pull_report"
      : action === "generate_plan"
        ? "route_generator.generate"
        : action === "approve_plan"
          ? "route_generator.approve"
          : action === "export_csv"
            ? "route_generator.export"
            : action === "update_vehicle" || action === "update_depot"
              ? "route_generator.manage_settings"
              : "route_generator.view";

  const gate = await requireAccess(request, permission as Parameters<typeof hasRoutePermission>[1]);
  if ("error" in gate && gate.error) return gate.error;
  const session = gate.session!;

  try {
    if (action === "pull_report") {
      const date = String(body.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Select a valid operating date (YYYY-MM-DD)." }, { status: 400 });
      }
      const result = await pullReportForDate({
        date,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json(result);
    }

    if (action === "assign_skipped_occurrence") {
      const reportRunId = String(body.reportRunId ?? "").trim();
      const occurrenceId = Number(body.occurrenceId);
      const vanKey = String(body.vanKey ?? "").trim();
      if (!reportRunId || !Number.isFinite(occurrenceId) || !vanKey) {
        return NextResponse.json({ error: "reportRunId, occurrenceId, and vanKey are required." }, { status: 400 });
      }
      const result = await assignSkippedOccurrence({
        reportRunId,
        occurrenceId,
        vanKey,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json(result);
    }

    if (action === "list_gingr_taxi") {
      const date = String(body.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Select a valid operating date (YYYY-MM-DD)." }, { status: 400 });
      }
      const taxi = await listGingrTaxiServicesByDate(date);
      return NextResponse.json(taxi);
    }

    if (action === "add_taxi") {
      const reportRunId = String(body.reportRunId ?? "").trim();
      if (!reportRunId) return NextResponse.json({ error: "reportRunId is required." }, { status: 400 });
      const waveRaw = String(body.wave ?? "both").trim().toLowerCase();
      const wave =
        waveRaw === "pickup" || waveRaw === "dropoff" || waveRaw === "both" ? waveRaw : "both";
      const result = await addTaxiToReportRun({
        reportRunId,
        source: body.source === "gingr" ? "gingr" : "manual",
        vanKey: body.vanKey ? String(body.vanKey) : null,
        wave,
        gingrReservationId: body.gingrReservationId ? String(body.gingrReservationId) : null,
        gingrRow: (body.gingrRow as never) || null,
        dogName: body.dogName ? String(body.dogName) : null,
        ownerName: body.ownerName ? String(body.ownerName) : null,
        address: body.address ? String(body.address) : null,
        city: body.city ? String(body.city) : null,
        state: body.state ? String(body.state) : null,
        zip: body.zip ? String(body.zip) : null,
        phone: body.phone ? String(body.phone) : null,
        notes: body.notes ? String(body.notes) : null,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json(result);
    }

    if (action === "generate_plan") {
      const reportRunId = String(body.reportRunId ?? "").trim();
      if (!reportRunId) return NextResponse.json({ error: "reportRunId is required." }, { status: 400 });
      const bundle = await generatePlanForRun({
        reportRunId,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json(bundle);
    }

    if (action === "approve_plan") {
      const planId = String(body.planId ?? "").trim();
      if (!planId) return NextResponse.json({ error: "planId is required." }, { status: 400 });
      const plan = await approvePlan({
        planId,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json({ plan });
    }

    if (action === "export_csv") {
      const planId = String(body.planId ?? "").trim();
      if (!planId) return NextResponse.json({ error: "planId is required." }, { status: 400 });
      const result = await exportSamsaraCsv({
        planId,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        emergencyOverride: Boolean(body.emergencyOverride),
        overrideReason: body.overrideReason ? String(body.overrideReason) : undefined
      });
      return NextResponse.json(result);
    }

    if (action === "update_depot") {
      const supabase = getServiceSupabase();
      const value = body.depot ?? {};
      await supabase.from("route_generator_settings").upsert({
        key: "depot",
        value,
        updated_by: session.adminUserId ?? null
      });
      await writeRouteAuditEvent({
        action: "route_generator.settings_changed",
        entityType: "depot",
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        newValue: value
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "update_vehicle") {
      const vanKey = String(body.vanKey ?? "");
      if (!["van_1", "van_2", "van_3", "van_5", "van_6"].includes(vanKey)) {
        return NextResponse.json({ error: "Invalid van. Van 4 is not allowed." }, { status: 400 });
      }
      const supabase = getServiceSupabase();
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      const { error } = await supabase.from("route_vehicle_configs").update(patch).eq("van_key", vanKey);
      if (error) throw new Error(error.message);
      await writeRouteAuditEvent({
        action: "route_generator.vehicle_capacity_changed",
        entityType: "route_vehicle_config",
        entityId: vanKey,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        newValue: patch
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[route-generator] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Route Generator request failed." },
      { status: 500 }
    );
  }
}
