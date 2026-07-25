import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { canManageFitdogAlerts, canViewFitdogAlerts } from "@/lib/fitdog-ops/access";
import { formatUsd } from "@/lib/fitdog-ops/money";
import { runFitdogSync } from "@/lib/fitdog-ops/sync";
import { notifyFitdogPaymentAlert } from "@/lib/fitdog-ops/notifications";
import {
  assignOperationsAlert,
  countUnacknowledgedPaymentAlerts,
  getFitdogIntegrationSettings,
  getLatestSuccessfulSync,
  getOperationsAlert,
  getOperationsAlertSummary,
  listOperationsAlerts,
  listSyncRuns,
  updateFitdogIntegrationSettings,
  updateOperationsAlert
} from "@/lib/fitdog-ops/store";
import type { FitdogAlertType, OperationsAlertListFilters, OperationsAlertStatus } from "@/lib/fitdog-ops/types";
import { getServiceSupabase } from "@/lib/supabase/server";
import { listAdminUsers } from "@/lib/admin/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canViewFitdogAlerts(access, session?.role)) {
    return { error: NextResponse.json({ error: "Fitdog Alerts access required." }, { status: 403 }) };
  }
  return {
    session,
    access,
    supabase,
    canManage: canManageFitdogAlerts(access, session?.role)
  };
}

function actorName(session: ReturnType<typeof getAdminSessionFromRequest>, access: Awaited<ReturnType<typeof getUserAccess>> | null) {
  return access?.displayLabel || session?.email || "Admin";
}

export async function GET(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "list";
  const supabase = gate.supabase!;

  try {
    if (view === "badge") {
      const count = await countUnacknowledgedPaymentAlerts(supabase);
      return NextResponse.json({ count });
    }

    if (view === "sync") {
      const [latest, history, settings] = await Promise.all([
        getLatestSuccessfulSync(supabase),
        listSyncRuns(supabase, 30),
        getFitdogIntegrationSettings(supabase)
      ]);
      return NextResponse.json({ latest, history, settings, canManage: gate.canManage });
    }

    if (view === "settings") {
      const settings = await getFitdogIntegrationSettings(supabase);
      return NextResponse.json({
        settings: {
          ...settings,
          encrypted_session: settings.encrypted_session?.v ? { configured: true } : {}
        },
        canManage: gate.canManage
      });
    }

    if (view === "detail") {
      const id = url.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "Alert id required." }, { status: 400 });
      const detail = await getOperationsAlert(supabase, id);
      if (!detail) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
      return NextResponse.json({ ...detail, canManage: gate.canManage, amount_due_label: formatUsd(detail.alert.amount_due, detail.alert.currency) });
    }

    const filters: OperationsAlertListFilters = {
      view: (url.searchParams.get("listView") as OperationsAlertListFilters["view"]) || "payment",
      q: url.searchParams.get("q") || undefined,
      alertType: (url.searchParams.get("alertType") as FitdogAlertType | "all") || "all",
      status: (url.searchParams.get("status") as OperationsAlertStatus | "all") || "all",
      assignedUserId: url.searchParams.get("assignedUserId") || "all",
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      owner: url.searchParams.get("owner") || undefined,
      dog: url.searchParams.get("dog") || undefined,
      service: url.searchParams.get("service") || undefined,
      minAmount: url.searchParams.get("minAmount") ? Number(url.searchParams.get("minAmount")) : null,
      unassignedOnly: url.searchParams.get("unassignedOnly") === "1",
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 50),
      sortBy: url.searchParams.get("sortBy") || "detected_at",
      sortDir: url.searchParams.get("sortDir") === "asc" ? "asc" : "desc"
    };

    const [list, summary, settings, assignableUsers] = await Promise.all([
      listOperationsAlerts(supabase, filters),
      getOperationsAlertSummary(supabase),
      getFitdogIntegrationSettings(supabase),
      listAdminUsers(supabase).catch(() => [])
    ]);

    return NextResponse.json({
      ...list,
      summary,
      settings: {
        ...settings,
        encrypted_session: settings.encrypted_session?.v ? { configured: true } : {}
      },
      assignableUsers: (assignableUsers || [])
        .filter((user) => canViewFitdogAlerts(null, user.role))
        .map((user) => ({ id: user.id, name: user.full_name || user.email, email: user.email, role: user.role })),
      canManage: gate.canManage,
      rows: list.rows.map((row) => ({
        ...row,
        amount_due_label: formatUsd(row.amount_due, row.currency),
        amount_paid_label: formatUsd(row.amount_paid, row.currency)
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Fitdog alerts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  if (!gate.canManage) {
    return NextResponse.json({ error: "Manage Fitdog Alerts permission required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  const supabase = gate.supabase!;
  const session = gate.session;
  const actor = actorName(session, gate.access);
  const actorUserId = session?.adminUserId ?? null;

  try {
    if (action === "sync") {
      const mode = body.mode === "backfill" || body.mode === "reconciliation" ? body.mode : "incremental";
      const run = await runFitdogSync(supabase, {
        trigger: "manual",
        mode,
        actorUserId,
        force: true
      });
      return NextResponse.json({ ok: true, run });
    }

    if (action === "update_settings") {
      const settings = await updateFitdogIntegrationSettings(
        supabase,
        {
          integration_mode:
            body.integration_mode === "api" || body.integration_mode === "webhook" || body.integration_mode === "playwright"
              ? body.integration_mode
              : undefined,
          sync_enabled: body.sync_enabled != null ? Boolean(body.sync_enabled) : undefined,
          missed_payment_grace_minutes:
            body.missed_payment_grace_minutes != null ? Number(body.missed_payment_grace_minutes) : undefined,
          backfill_days: body.backfill_days != null ? Number(body.backfill_days) : undefined,
          reconciliation_days: body.reconciliation_days != null ? Number(body.reconciliation_days) : undefined,
          incremental_interval_minutes:
            body.incremental_interval_minutes != null ? Number(body.incremental_interval_minutes) : undefined,
          notes: body.notes != null ? String(body.notes) : undefined
        },
        actorUserId
      );
      return NextResponse.json({
        ok: true,
        settings: { ...settings, encrypted_session: settings.encrypted_session?.v ? { configured: true } : {} }
      });
    }

    const alertId = String(body.alert_id || "");
    if (!alertId && action !== "sync" && action !== "update_settings") {
      return NextResponse.json({ error: "alert_id is required." }, { status: 400 });
    }

    if (action === "acknowledge") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        { status: "acknowledged", acknowledged_at: new Date().toISOString() },
        { type: "status_change", message: "Alert acknowledged.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "assign_to_me") {
      const alert = await assignOperationsAlert(supabase, {
        alert_id: alertId,
        assigned_user_id: actorUserId,
        assigned_user_name: actor,
        assigned_by_user_id: actorUserId,
        assigned_by_name: actor
      });
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "assign") {
      const alert = await assignOperationsAlert(supabase, {
        alert_id: alertId,
        assigned_user_id: body.assigned_user_id != null ? String(body.assigned_user_id) : null,
        assigned_user_name: body.assigned_user_name != null ? String(body.assigned_user_name) : null,
        assigned_by_user_id: actorUserId,
        assigned_by_name: actor,
        note: body.note != null ? String(body.note) : null
      });
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "add_note") {
      const note = String(body.note || "").trim();
      if (!note) return NextResponse.json({ error: "Note required." }, { status: 400 });
      const detail = await getOperationsAlert(supabase, alertId);
      if (!detail) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        { resolution_notes: [detail.alert.resolution_notes, note].filter(Boolean).join("\n") },
        { type: "note", message: note, actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "owner_contacted") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        { status: "owner_contacted" },
        { type: "owner_contact", message: "Marked owner contacted.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "schedule_follow_up") {
      const followUpAt = String(body.follow_up_at || "");
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        { status: "follow_up_scheduled", follow_up_at: followUpAt || null },
        {
          type: "follow_up",
          message: followUpAt ? `Follow-up scheduled for ${followUpAt}.` : "Follow-up scheduled.",
          actor_user_id: actorUserId,
          actor_name: actor
        }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "awaiting_payment") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        { status: "awaiting_payment" },
        { type: "status_change", message: "Marked awaiting payment.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "record_manual_payment" || action === "mark_paid") {
      const amount = body.amount != null ? Number(body.amount) : undefined;
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        {
          status: "paid",
          alert_type: "PAYMENT_RESOLVED",
          amount_paid: amount,
          resolved_at: new Date().toISOString(),
          resolution_type: action === "record_manual_payment" ? "manual_payment" : "marked_paid",
          resolution_notes: body.note != null ? String(body.note) : null,
          severity: "low"
        },
        {
          type: action === "record_manual_payment" ? "manual_payment" : "status_change",
          message: action === "record_manual_payment" ? "Manual payment recorded." : "Marked paid.",
          actor_user_id: actorUserId,
          actor_name: actor,
          metadata: { amount }
        }
      );
      await notifyFitdogPaymentAlert(supabase, alert, "resolved");
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "mark_waived") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        {
          status: "waived",
          resolved_at: new Date().toISOString(),
          resolution_type: "waived",
          resolution_notes: body.note != null ? String(body.note) : null
        },
        { type: "waiver", message: "Marked waived.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "mark_false_positive") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        {
          status: "false_positive",
          resolved_at: new Date().toISOString(),
          resolution_type: "false_positive",
          resolution_notes: body.note != null ? String(body.note) : null
        },
        { type: "false_positive", message: "Marked false positive.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "resolve") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        {
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_type: "manual_resolve",
          resolution_notes: body.note != null ? String(body.note) : null
        },
        { type: "status_change", message: "Alert resolved.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "reopen") {
      const alert = await updateOperationsAlert(
        supabase,
        alertId,
        {
          status: "reopened",
          resolved_at: null,
          resolution_type: null
        },
        { type: "status_change", message: "Alert reopened.", actor_user_id: actorUserId, actor_name: actor }
      );
      return NextResponse.json({ ok: true, alert });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Fitdog alert.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
