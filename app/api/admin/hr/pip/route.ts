import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { inferEmployeeRoleFromHrSignals } from "@/lib/hr/fitdog-roles";
import { isHrRecord, toHrRecord } from "@/lib/hr/records";
import {
  activePipPlans,
  addPipCheckIn,
  createPipPlan,
  createPipPlansBulk,
  defaultNextReviewDate,
  defaultTargetEndDate,
  deletePipPlan,
  listPipPlans,
  pipReviewsDueThisWeek,
  updatePipPlan,
  type PipPlanInput,
  type PipStatus
} from "@/lib/hr/pip";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage PIP plans." }, { status: 403 });
}

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access, supabase };
}

function actorLabel(access: Awaited<ReturnType<typeof getUserAccess>> | null, session: ReturnType<typeof getAdminSessionFromRequest>) {
  return access?.displayLabel || session?.email || "Admin";
}

function parsePlanInput(body: Record<string, unknown>): PipPlanInput {
  return {
    employee_name: String(body.employee_name || ""),
    employee_role: body.employee_role != null ? String(body.employee_role) : null,
    manager_name: body.manager_name != null ? String(body.manager_name) : null,
    focus_area: String(body.focus_area || ""),
    goals: Array.isArray(body.goals) ? body.goals.map((g) => String(g)) : undefined,
    success_metrics: body.success_metrics != null ? String(body.success_metrics) : null,
    support_offered: body.support_offered != null ? String(body.support_offered) : null,
    employee_facing_summary: body.employee_facing_summary != null ? String(body.employee_facing_summary) : null,
    manager_notes: body.manager_notes != null ? String(body.manager_notes) : null,
    start_date: body.start_date != null ? String(body.start_date) : undefined,
    next_review_date: body.next_review_date != null ? String(body.next_review_date) : null,
    target_end_date: body.target_end_date != null ? String(body.target_end_date) : null,
    progress_percent: body.progress_percent != null ? Number(body.progress_percent) : 0,
    status: (body.status as PipStatus | undefined) ?? "Active",
    notes: body.notes != null ? String(body.notes) : null,
    source_record_ids: Array.isArray(body.source_record_ids)
      ? body.source_record_ids.map((id) => String(id))
      : undefined
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const plans = await listPipPlans(supabase);
    return NextResponse.json({
      plans,
      active: activePipPlans(plans),
      reviews_this_week: pipReviewsDueThisWeek(plans),
      currentUser: {
        email: session?.email ?? null,
        role: session?.role ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load PIP plans.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actor = actorLabel(access, session);

    if (body.action === "create_from_records") {
      const ids = Array.isArray(body.record_ids) ? body.record_ids.map((id) => String(id)).filter(Boolean) : [];
      if (!ids.length) {
        return NextResponse.json({ error: "Select at least one HR record." }, { status: 400 });
      }

      const byEmployee = new Map<
        string,
        {
          employee_name: string;
          employee_role: string | null;
          summaries: string[];
          recordIds: string[];
          reportTypes: string[];
        }
      >();

      for (const id of ids) {
        const report = await getManagementReportById(supabase, id);
        if (!report || !isHrRecord(report) || report.hr_hub_hidden) continue;
        const record = toHrRecord(report);
        const employee_name = (record.subject_name || "Team member").trim();
        const key = employee_name.toLowerCase();
        const inferredRole = inferEmployeeRoleFromHrSignals({
          report_type: report.report_type,
          department: record.department,
          subject_name: record.subject_name,
          title: record.title,
          summary: record.summary,
          dog_handler_name: report.dog_handler_name,
          employee_department: report.write_up_details?.employee_department
        });
        const existing = byEmployee.get(key) ?? {
          employee_name,
          employee_role: inferredRole,
          summaries: [],
          recordIds: [],
          reportTypes: []
        };
        existing.summaries.push(record.summary || record.title);
        existing.recordIds.push(record.id);
        existing.reportTypes.push(record.report_type);
        // Prefer Dog Handler over a misleading Front Desk department label.
        if (inferredRole === "Dog Handler" || !existing.employee_role) {
          existing.employee_role = inferredRole;
        }
        byEmployee.set(key, existing);
      }

      if (!byEmployee.size) {
        return NextResponse.json({ error: "No valid HR records found for PIP creation." }, { status: 400 });
      }

      const inputs: PipPlanInput[] = [...byEmployee.values()].map((group) => {
        const isHandler =
          group.employee_role === "Dog Handler" ||
          group.reportTypes.some((type) => type === "owner_complaint_dog_handler");
        const focusSeed = group.summaries[0]?.slice(0, 160) || "Performance expectations and workplace standards";
        return {
          employee_name: group.employee_name,
          employee_role: group.employee_role || (isHandler ? "Dog Handler" : null),
          manager_name: actor,
          focus_area: isHandler
            ? `Dog Handler growth plan: safe yard monitoring, dog care standards, and clear handler communication. Context: ${focusSeed}`
            : `Growth plan: ${focusSeed}`,
          goals: isHandler
            ? [
                "Maintain active, attentive yard monitoring and safe play-group management during assigned shifts",
                "Follow Fitdog handler standards for leash transitions, walk-outs, and dog movement through the building",
                "Escalate dog safety concerns promptly using the correct team-lead / management path",
                "Apply coaching feedback consistently and ask for clarification early when unsure"
              ]
            : [
                "Meet clear role expectations discussed in check-ins",
                "Apply feedback consistently during scheduled shifts",
                "Document questions early so support can be provided"
              ],
          success_metrics: isHandler
            ? "Consistent safe yard presence and dog monitoring across scheduled check-ins, with specific examples of handler standards met and no unmanaged safety gaps during the review period."
            : "Consistent improvement across scheduled check-ins, with specific examples of expectations met and support used.",
          support_offered: isHandler
            ? "Manager/team-lead coaching on yard standards, shadow shifts if needed, clear written handler expectations, and regular check-ins during paid work time."
            : "Manager coaching, clear written expectations, and regular check-ins. Training or schedule clarity will be offered where needed.",
          employee_facing_summary: isHandler
            ? "This is a structured support plan for your work as a Dog Handler. We believe in your ability to succeed caring for and monitoring dogs on the yard and during walk-outs. We will set clear expectations, check in regularly, and coach you so you have a fair path to win."
            : "This is a structured support plan. We believe in your ability to succeed here. We will set clear expectations, check in regularly, and provide coaching so you have a fair path to win.",
          manager_notes: `Created from HR record(s): ${group.recordIds.join(", ")}. Role inferred: ${
            group.employee_role || "unspecified"
          }. Source themes: ${group.summaries.slice(0, 3).join(" | ")}`,
          start_date: new Date().toISOString().slice(0, 10),
          next_review_date: defaultNextReviewDate(),
          target_end_date: defaultTargetEndDate(),
          progress_percent: 0,
          status: "Active",
          source_record_ids: group.recordIds
        };
      });

      const plans = await createPipPlansBulk(supabase, inputs, actor);
      return NextResponse.json({ plans, created: plans.length });
    }

    if (body.action === "add_check_in") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "PIP id is required." }, { status: 400 });
      const plan = await addPipCheckIn(
        supabase,
        id,
        {
          note: String(body.note || ""),
          date: body.date != null ? String(body.date) : undefined,
          progress_percent: body.progress_percent != null ? Number(body.progress_percent) : undefined
        },
        actor
      );
      return NextResponse.json({ plan });
    }

    const plan = await createPipPlan(supabase, parsePlanInput(body), actor);
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create PIP plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "PIP id is required." }, { status: 400 });

    const input = parsePlanInput(body);
    const plan = await updatePipPlan(supabase, id, {
      employee_name: body.employee_name != null ? input.employee_name : undefined,
      employee_role: body.employee_role === null ? null : body.employee_role != null ? input.employee_role : undefined,
      manager_name: body.manager_name === null ? null : body.manager_name != null ? input.manager_name : undefined,
      focus_area: body.focus_area != null ? input.focus_area : undefined,
      goals: body.goals != null ? input.goals : undefined,
      success_metrics:
        body.success_metrics === null ? null : body.success_metrics != null ? input.success_metrics : undefined,
      support_offered:
        body.support_offered === null ? null : body.support_offered != null ? input.support_offered : undefined,
      employee_facing_summary:
        body.employee_facing_summary === null
          ? null
          : body.employee_facing_summary != null
            ? input.employee_facing_summary
            : undefined,
      manager_notes: body.manager_notes === null ? null : body.manager_notes != null ? input.manager_notes : undefined,
      start_date: body.start_date != null ? input.start_date : undefined,
      next_review_date:
        body.next_review_date === null ? null : body.next_review_date != null ? input.next_review_date : undefined,
      target_end_date:
        body.target_end_date === null ? null : body.target_end_date != null ? input.target_end_date : undefined,
      progress_percent: body.progress_percent != null ? input.progress_percent : undefined,
      status: body.status != null ? input.status : undefined,
      notes: body.notes === null ? null : body.notes != null ? input.notes : undefined,
      source_record_ids: body.source_record_ids != null ? input.source_record_ids : undefined
    });
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update PIP plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "PIP id is required." }, { status: 400 });
    await deletePipPlan(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete PIP plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
