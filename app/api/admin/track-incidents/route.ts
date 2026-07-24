import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createManualTrackIncident,
  getLatestSyncRun,
  getTrackIncidentSummary,
  isValidPriority,
  isValidStatus,
  listIncidentTypes,
  listRecentSyncRuns,
  listTrackIncidents,
  syncIncidentsFromWebhookInbox,
  updateTrackIncident,
  type TrackIncidentListFilters,
  type TrackIncidentSource,
  type TrackIncidentStatus
} from "@/lib/staff/track-incidents";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireTrackIncidentsAccess(request: Request) {
  if (!(await isAdminRequest(request))) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const canView =
    hasPermission(access, "view_track_incidents") ||
    hasPermission(access, "manage_track_incidents") ||
    session?.role === "owner_admin" ||
    session?.role === "manager_admin" ||
    session?.role === "admin" ||
    session?.role === "management" ||
    session?.role === "assistant_manager";
  const canManage =
    hasPermission(access, "manage_track_incidents") ||
    session?.role === "owner_admin" ||
    session?.role === "manager_admin" ||
    session?.role === "admin" ||
    session?.role === "management" ||
    session?.role === "assistant_manager";
  if (!canView) {
    return { error: NextResponse.json({ error: "Track Incidents access required." }, { status: 403 }) };
  }
  return { session, access, canManage, supabase };
}

export async function GET(request: Request) {
  const gate = await requireTrackIncidentsAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "list";
  const supabase = gate.supabase!;

  try {
    if (view === "sync") {
      const [latest, history] = await Promise.all([getLatestSyncRun(supabase), listRecentSyncRuns(supabase, 15)]);
      return NextResponse.json({ latest, history });
    }

    const filters: TrackIncidentListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      status: (url.searchParams.get("status") as TrackIncidentStatus | "all") || "all",
      source: (url.searchParams.get("source") as TrackIncidentSource | "all") || "all",
      incidentType: url.searchParams.get("incidentType") ?? "all",
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25),
      sortBy: url.searchParams.get("sortBy") ?? "occurred_at",
      sortDir: url.searchParams.get("sortDir") === "asc" ? "asc" : "desc"
    };

    const [list, summary, types, latestSync] = await Promise.all([
      listTrackIncidents(supabase, filters),
      getTrackIncidentSummary(supabase),
      listIncidentTypes(supabase),
      getLatestSyncRun(supabase)
    ]);

    return NextResponse.json({
      ...list,
      summary,
      incidentTypes: types,
      latestSync,
      canManage: gate.canManage
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load incidents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireTrackIncidentsAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  if (!gate.canManage) {
    return NextResponse.json({ error: "Manage Track Incidents permission required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = gate.supabase!;

  try {
    if (action === "sync") {
      const run = await syncIncidentsFromWebhookInbox(supabase, {
        trigger: "manual",
        actorUserId: gate.session?.adminUserId ?? null
      });
      return NextResponse.json({ ok: true, run });
    }

    if (action === "create") {
      const record = await createManualTrackIncident(supabase, {
        dog_name: String(body.dog_name ?? ""),
        owner_name: String(body.owner_name ?? ""),
        dog_breed: body.dog_breed ? String(body.dog_breed) : null,
        incident_type: String(body.incident_type ?? ""),
        notes: String(body.notes ?? ""),
        reported_by: String(body.reported_by ?? gate.session?.email ?? "Staff"),
        occurred_at: body.occurred_at ? String(body.occurred_at) : null,
        priority: isValidPriority(body.priority) ? body.priority : "medium",
        assigned_to_name: body.assigned_to_name ? String(body.assigned_to_name) : null
      });
      return NextResponse.json({ ok: true, record });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Incident id is required." }, { status: 400 });
      const record = await updateTrackIncident(supabase, id, {
        status: isValidStatus(body.status) ? body.status : undefined,
        priority: isValidPriority(body.priority) ? body.priority : undefined,
        assigned_to_name: body.assigned_to_name !== undefined ? String(body.assigned_to_name ?? "") || null : undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
        latest_update: body.latest_update !== undefined ? String(body.latest_update) : undefined
      });
      return NextResponse.json({ ok: true, record });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Track incidents action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
