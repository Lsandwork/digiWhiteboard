import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canReviewManagementSupportWithAccess, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { buildSupportCommandCenter } from "@/lib/admin/support-command-center/build";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createPipPlan,
  defaultNextReviewDate,
  defaultTargetEndDate,
  updatePipPlan
} from "@/lib/hr/pip";
import { applySupportItemAction } from "@/lib/staff/management-support-admin";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function actorContext(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access, supabase };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorContext(request);
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to open the Support Command Center." }, { status: 403 });
  }

  try {
    const payload = await buildSupportCommandCenter(supabase, {
      email: session?.email ?? null,
      role: session?.role ?? null
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Support Command Center.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorContext(request);
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage support items." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const actor = access?.displayLabel || session?.email || "Admin";

    if (action === "create_pip") {
      const employee_name = String(body.employee_name ?? "").trim();
      const focus_area = String(body.focus_area ?? "").trim();
      if (!employee_name || !focus_area) {
        return NextResponse.json({ error: "Employee name and focus area are required." }, { status: 400 });
      }
      const plan = await createPipPlan(
        supabase,
        {
          employee_name,
          employee_role: body.employee_role != null ? String(body.employee_role) : null,
          manager_name: body.manager_name != null ? String(body.manager_name) : actor,
          title: body.title != null ? String(body.title) : null,
          focus_area,
          goals: Array.isArray(body.goals) ? body.goals.map(String) : undefined,
          support_offered: body.support_offered != null ? String(body.support_offered) : null,
          employee_facing_summary: body.employee_facing_summary != null ? String(body.employee_facing_summary) : null,
          manager_notes: body.manager_notes != null ? String(body.manager_notes) : null,
          start_date: body.start_date != null ? String(body.start_date) : new Date().toISOString().slice(0, 10),
          next_review_date: body.next_review_date != null ? String(body.next_review_date) : defaultNextReviewDate(),
          target_end_date: body.target_end_date != null ? String(body.target_end_date) : defaultTargetEndDate(),
          status: "Active",
          stage: "Stage 1",
          source_record_ids: Array.isArray(body.source_record_ids) ? body.source_record_ids.map(String) : undefined
        },
        actor
      );
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email ?? actor,
        action: "staff.support_command_center.create_pip",
        targetType: "pip",
        targetId: plan.id,
        details: { employee_name, focus_area }
      });
      return NextResponse.json({ plan });
    }

    if (action === "update_pip") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "PIP id is required." }, { status: 400 });
      const plan = await updatePipPlan(supabase, id, {
        progress_percent: body.progress_percent != null ? Number(body.progress_percent) : undefined,
        status: body.status != null ? (body.status as "Active" | "On Hold" | "Completed" | "Cancelled") : undefined,
        stage: body.stage != null ? (body.stage as never) : undefined,
        risk_level: body.risk_level != null ? (body.risk_level as never) : undefined,
        next_review_date: body.next_review_date != null ? String(body.next_review_date) : undefined,
        manager_notes: body.manager_notes != null ? String(body.manager_notes) : undefined
      });
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email ?? actor,
        action: "staff.support_command_center.update_pip",
        targetType: "pip",
        targetId: id,
        details: { fields: Object.keys(body) }
      });
      return NextResponse.json({ plan });
    }

    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Case id is required." }, { status: 400 });
    const before = await getManagementReportById(supabase, id);
    if (!before) return NextResponse.json({ error: "Support case not found." }, { status: 404 });

    const updated = await applySupportItemAction(supabase, id, action, body, actor);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email ?? actor,
      action: `staff.support_command_center.${action}`,
      targetType: "management_report",
      targetId: id,
      details: { action, title: updated.title }
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Support Command Center.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
