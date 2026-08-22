import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { OPS_SNAPSHOT_TIMEOUT_MS } from "@/lib/ops-command-center/constants";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";
import { humanizeUnknownError } from "@/lib/safe-url";
import {
  accessFromLegacyRole,
  hasPermission,
  legacyRoleToRoleKey,
  ROLE_LABELS
} from "@/lib/admin/permissions";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { loadOpsCommandCenterSnapshot } from "@/lib/ops-command-center/snapshot";
import { searchOpsDogs } from "@/lib/ops-command-center/dogs";
import { searchBoardDogs } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import { createOpsTask, updateOpsTaskStatus } from "@/lib/ops-command-center/tasks";
import {
  acknowledgeOpsNotification,
  resolveOpsNotification
} from "@/lib/ops-command-center/notifications";
import { recordOpsEvent } from "@/lib/ops-command-center/events";
import { buildOpsSystemHealth } from "@/lib/ops-command-center/system-health";
import {
  applyWorkItemAction,
  WORK_ITEM_ACTIONS,
  type WorkItemAction
} from "@/lib/ops-command-center/work-item-actions";
import {
  acknowledgeShiftHandoff,
  completeOvernightRound,
  createShiftHandoff,
  ensureOvernightRoundsForDate,
  escalateMissedOvernightRounds,
  listRecentShiftHandoffs
} from "@/lib/ops-command-center/overnight-handoff";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function requireOpsAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // Session role is enough to open My Shift. A live permission-matrix read used
  // to add 6s+ before the snapshot even started, which blew the client abort.
  const access = accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  const canView =
    hasPermission(access, "view_my_shift") ||
    hasPermission(access, "view_ops_command_center") ||
    hasPermission(access, "view_admin_panel");
  if (!canView) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, access };
}

export async function GET(request: Request) {
  const gate = await requireOpsAccess(request);
  if ("error" in gate) return gate.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  if (q) {
    const [dogs, boardDogs] = await Promise.all([
      withTimeoutFallback(searchOpsDogs(q, 25).catch(() => []), OPS_SNAPSHOT_TIMEOUT_MS, []),
      withTimeoutFallback(searchBoardDogs(q, 25).catch(() => []), OPS_SNAPSHOT_TIMEOUT_MS, [])
    ]);
    return NextResponse.json({ dogs, boardDogs });
  }

  const view = url.searchParams.get("view");
  if (view === "system_health") {
    try {
      const health = await withTimeoutFallback(buildOpsSystemHealth(), OPS_SNAPSHOT_TIMEOUT_MS, null);
      if (health) return NextResponse.json(health);
    } catch {
      // Fall through to a safe payload.
    }
    return NextResponse.json({ error: "Unable to load system health." }, { status: 503 });
  }
  if (view === "overnight") {
    await escalateMissedOvernightRounds().catch(() => 0);
    const rounds = await withTimeoutFallback(ensureOvernightRoundsForDate(), OPS_SNAPSHOT_TIMEOUT_MS, []);
    return NextResponse.json({ rounds });
  }
  if (view === "handoffs") {
    const handoffs = await withTimeoutFallback(listRecentShiftHandoffs(20), OPS_SNAPSHOT_TIMEOUT_MS, []);
    return NextResponse.json({ handoffs });
  }

  try {
    const roleKey = legacyRoleToRoleKey(gate.session.role);
    const snapshot = await loadOpsCommandCenterSnapshot({
      adminUserId: gate.session.adminUserId,
      email: gate.session.email,
      displayName: gate.access.displayLabel || null,
      roleKey,
      roleLabel: ROLE_LABELS[roleKey] || gate.access.displayLabel || "Staff",
      access: gate.access
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error: humanizeUnknownError(error, "Unable to load My Shift. Retry shortly.")
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireOpsAccess(request);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  const actor = {
    adminId: gate.session.adminUserId,
    email: gate.session.email,
    name: gate.session.email,
    role: gate.session.role
  };

  if (action === "create_task") {
    if (!hasPermission(gate.access, "manage_ops_tasks") && !hasPermission(gate.access, "view_admin_panel")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const task = await createOpsTask({
      title,
      dogId: body.dogId ? String(body.dogId) : null,
      assignedAdminId: body.assignedAdminId ? String(body.assignedAdminId) : gate.session.adminUserId,
      assignedRole: body.assignedRole ? String(body.assignedRole) : null,
      dueAt: body.dueAt ? String(body.dueAt) : null,
      priority: (body.priority as "critical" | "high" | "attention" | "informational") || "attention",
      notes: body.notes ? String(body.notes) : null,
      createdFrom: "ops_command_center",
      actor
    });
    return NextResponse.json({ task });
  }

  if (action === "update_task_status") {
    if (!hasPermission(gate.access, "manage_ops_tasks") && !hasPermission(gate.access, "view_admin_panel")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const taskId = String(body.taskId || "");
    const status = String(body.status || "") as
      | "open"
      | "in_progress"
      | "completed"
      | "snoozed"
      | "escalated"
      | "cancelled";
    if (!taskId || !status) {
      return NextResponse.json({ error: "taskId and status are required" }, { status: 400 });
    }
    const task = await updateOpsTaskStatus({
      taskId,
      status,
      actor,
      notes: body.notes ? String(body.notes) : undefined
    });
    return NextResponse.json({ task });
  }

  if (action === "work_item_action") {
    const itemId = String(body.itemId || "").trim();
    const workAction = String(body.workAction || "").trim() as WorkItemAction;
    if (!itemId || !WORK_ITEM_ACTIONS.includes(workAction)) {
      return NextResponse.json({ error: "itemId and workAction are required" }, { status: 400 });
    }
    try {
      const result = await applyWorkItemAction({
        itemId,
        action: workAction,
        actor: {
          adminId: gate.session.adminUserId,
          email: gate.session.email,
          name: gate.access.displayLabel || gate.session.email,
          role: gate.session.role
        },
        title: body.title ? String(body.title) : null
      });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update work item";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (action === "acknowledge_notification") {
    const notification = await acknowledgeOpsNotification({
      notificationId: String(body.notificationId || ""),
      actor
    });
    return NextResponse.json({ notification });
  }

  if (action === "resolve_notification") {
    const notification = await resolveOpsNotification({
      notificationId: String(body.notificationId || ""),
      actor,
      resolutionNotes: body.resolutionNotes ? String(body.resolutionNotes) : null
    });
    return NextResponse.json({ notification });
  }

  if (action === "complete_overnight_round") {
    const round = await completeOvernightRound({
      roundId: String(body.roundId || ""),
      notes: body.notes ? String(body.notes) : null,
      actor
    });
    return NextResponse.json({ round });
  }

  if (action === "create_shift_handoff") {
    const { compileShiftHandoff, parseShiftHandoffItems } = await import("@/lib/ops-command-center/shift-handoff-items");
    const compiled = compileShiftHandoff(parseShiftHandoffItems(body.items));
    const summary = compiled.summary || String(body.summary || "").trim();
    if (!summary) {
      return NextResponse.json({ error: "Add at least one handoff item." }, { status: 400 });
    }
    const handoff = await createShiftHandoff({
      fromShift: String(body.fromShift || "Afternoon"),
      toShift: String(body.toShift || "Overnight"),
      summary,
      fields: compiled.count
        ? compiled.fields
        : ((body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
            ? body.fields
            : {}) as Record<string, string | null | undefined>),
      actor
    });
    return NextResponse.json({ handoff });
  }

  if (action === "ack_shift_handoff") {
    const handoff = await acknowledgeShiftHandoff({
      handoffId: String(body.handoffId || ""),
      actor
    });
    return NextResponse.json({ handoff });
  }

  if (action === "driver_event") {
    const event = await recordOpsEvent({
      eventType: `driver.${String(body.eventType || "update")}`,
      category: "transportation",
      title: `Driver: ${String(body.eventType || "update").replace(/_/g, " ")}`,
      summary: body.notes ? String(body.notes) : null,
      actor,
      sourceModule: "driver_mode",
      sourceRecordType: "driver_action",
      sourceRecordId: `${gate.session.adminUserId || "driver"}:${Date.now()}`
    });
    return NextResponse.json({ event, synced: true });
  }

  if (action === "trainer_session_complete") {
    const event = await recordOpsEvent({
      eventType: "training.session_completed",
      category: "training",
      title: "Training session completed",
      summary: body.notes ? String(body.notes) : null,
      actor,
      sourceModule: "trainer_ops",
      sourceRecordType: "trainer_session",
      sourceRecordId: `${gate.session.adminUserId || "trainer"}:${Date.now()}`
    });
    await createOpsTask({
      title: "Owner follow-up: training session recap",
      assignedRole: "trainer",
      priority: "attention",
      createdFrom: "trainer_ops",
      notes: body.notes ? String(body.notes) : null,
      actor
    });
    return NextResponse.json({ event });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
