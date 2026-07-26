import { NextResponse } from "next/server";
import { blockDemoWrite, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getServiceSupabase } from "@/lib/supabase/server";
import { markSessionArrived, markSessionCompleted } from "@/lib/live-tracking/service";
import { writeTrackingAuditEvent } from "@/lib/live-tracking/audit";

export const dynamic = "force-dynamic";

/**
 * Minimal driver workflow for assigned routes / stop completion.
 * Drivers never receive owner tracking tokens.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  const supabase = getServiceSupabase();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const { data, error } = await supabase
    .from("transport_tracking_sessions")
    .select(
      "id, direction, status, van_display_name, dog_names, stop_address_masked, current_eta_at, operating_date, health_status"
    )
    .eq("operating_date", today)
    .not("status", "in", "(completed,cancelled,failed,picked_up,dropped_off)")
    .order("current_eta_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ stops: [], note: error.message });
  }

  return NextResponse.json({
    stops: data ?? [],
    note: "Driver workflow shows assigned operational stops only. Tracking tokens are never exposed."
  });
}

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    sessionId?: string;
    reason?: string;
  };

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    if (body.action === "arrived") {
      await markSessionArrived(body.sessionId, {
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        reason: "driver_confirm_arrived"
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "complete") {
      await markSessionCompleted(body.sessionId, {
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        reason: "driver_confirm_complete"
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "delay") {
      await writeTrackingAuditEvent({
        action: "live_tracking.driver_reported_delay",
        entityType: "transport_tracking_session",
        entityId: body.sessionId,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role,
        reason: body.reason || "driver_delay"
      });
      const supabase = getServiceSupabase();
      await supabase
        .from("transport_tracking_sessions")
        .update({ status: "delayed", delay_incident_active: true, updated_at: new Date().toISOString() })
        .eq("id", body.sessionId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "privacy_pause") {
      const supabase = getServiceSupabase();
      await supabase
        .from("transport_tracking_sessions")
        .update({ emergency_privacy_mode: true, updated_at: new Date().toISOString() })
        .eq("id", body.sessionId);
      await writeTrackingAuditEvent({
        action: "live_tracking.driver_privacy_pause",
        entityType: "transport_tracking_session",
        entityId: body.sessionId,
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        actorRole: session.role
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Driver workflow error" },
      { status: 500 }
    );
  }
}
