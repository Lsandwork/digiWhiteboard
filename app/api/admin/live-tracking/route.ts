import { NextResponse } from "next/server";
import { blockDemoWrite, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canUseLiveTracking, hasLiveTrackingPermission } from "@/lib/live-tracking/access";
import type { LiveTrackingPermission } from "@/lib/live-tracking/flags";
import {
  cancelTrackingSession,
  createStaffPreviewToken,
  createTrackingSessionsFromPlan,
  getLiveTrackingBootstrap,
  issueRawTrackingTokenForSession,
  listManagementSessions,
  markSessionArrived,
  markSessionCompleted,
  applyEtaUpdate
} from "@/lib/live-tracking/service";
import { processQueuedNotifications } from "@/lib/live-tracking/notifications";
import { writeTrackingAuditEvent } from "@/lib/live-tracking/audit";

export const dynamic = "force-dynamic";

async function requireAccess(request: Request, permission: LiveTrackingPermission) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canUseLiveTracking(access) || !hasLiveTrackingPermission(access, permission)) {
    return {
      error: NextResponse.json({ error: "You do not have access to Live Tracking." }, { status: 403 })
    };
  }

  return { session, access };
}

export async function GET(request: Request) {
  const gate = await requireAccess(request, "live_tracking.view");
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "bootstrap";
  const date = url.searchParams.get("date") || undefined;

  try {
    if (action === "bootstrap") {
      return NextResponse.json({ bootstrap: await getLiveTrackingBootstrap() });
    }
    if (action === "sessions") {
      return NextResponse.json({ sessions: await listManagementSessions(date) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live tracking error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    planId?: string;
    sessionId?: string;
    reason?: string;
    etaAt?: string;
  };

  const action = body.action || "";
  const permissionMap: Record<string, LiveTrackingPermission> = {
    create_sessions: "live_tracking.manage",
    preview: "live_tracking.view",
    regenerate_link: "live_tracking.disable_session",
    disable: "live_tracking.disable_session",
    override_eta: "live_tracking.override_eta",
    send_test: "live_tracking.send_test",
    resend: "live_tracking.resend_notification",
    mark_arrived: "live_tracking.manage",
    mark_completed: "live_tracking.manage",
    process_notifications: "live_tracking.manage"
  };
  const permission = permissionMap[action] || "live_tracking.view";

  const gate = await requireAccess(request, permission);
  if ("error" in gate && gate.error) return gate.error;
  const session = gate.session;

  try {
    if (action === "create_sessions") {
      if (!body.planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
      const result = await createTrackingSessionsFromPlan({
        planId: body.planId,
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === "preview") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const preview = await createStaffPreviewToken(body.sessionId);
      await writeTrackingAuditEvent({
        action: "live_tracking.staff_preview",
        entityType: "transport_tracking_session",
        entityId: body.sessionId,
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role
      });
      return NextResponse.json({ ok: true, url: preview.url });
    }

    if (action === "regenerate_link") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const issued = await issueRawTrackingTokenForSession(body.sessionId);
      return NextResponse.json({ ok: true, url: issued.url });
    }

    if (action === "disable") {
      if (!body.sessionId || !body.reason?.trim()) {
        return NextResponse.json({ error: "sessionId and reason required" }, { status: 400 });
      }
      await cancelTrackingSession(body.sessionId, body.reason, {
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "override_eta") {
      if (!body.sessionId || !body.etaAt || !body.reason?.trim()) {
        return NextResponse.json({ error: "sessionId, etaAt, and reason required" }, { status: 400 });
      }
      await applyEtaUpdate({
        sessionId: body.sessionId,
        etaAt: body.etaAt,
        etaSource: "manual_override"
      });
      await writeTrackingAuditEvent({
        action: "live_tracking.eta_override",
        entityType: "transport_tracking_session",
        entityId: body.sessionId,
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role,
        reason: body.reason,
        newValue: { etaAt: body.etaAt }
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_arrived") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      await markSessionArrived(body.sessionId, {
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_completed") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      await markSessionCompleted(body.sessionId, {
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        actorRole: session?.role
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "process_notifications") {
      const result = await processQueuedNotifications();
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live tracking error" },
      { status: 500 }
    );
  }
}
