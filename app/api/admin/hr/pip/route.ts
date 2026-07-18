import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  activePipPlans,
  createPipPlan,
  listPipPlans,
  pipReviewsDueThisWeek,
  updatePipPlan,
  type PipStatus
} from "@/lib/hr/pip";
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
    const plan = await createPipPlan(
      supabase,
      {
        employee_name: String(body.employee_name || ""),
        employee_role: body.employee_role != null ? String(body.employee_role) : null,
        manager_name: body.manager_name != null ? String(body.manager_name) : null,
        focus_area: String(body.focus_area || ""),
        start_date: body.start_date != null ? String(body.start_date) : undefined,
        next_review_date: body.next_review_date != null ? String(body.next_review_date) : null,
        progress_percent: body.progress_percent != null ? Number(body.progress_percent) : 0,
        status: (body.status as PipStatus | undefined) ?? "Active",
        notes: body.notes != null ? String(body.notes) : null
      },
      access?.displayLabel || session?.email || "Admin"
    );
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

    const plan = await updatePipPlan(supabase, id, {
      employee_name: body.employee_name != null ? String(body.employee_name) : undefined,
      employee_role: body.employee_role === null ? null : body.employee_role != null ? String(body.employee_role) : undefined,
      manager_name: body.manager_name === null ? null : body.manager_name != null ? String(body.manager_name) : undefined,
      focus_area: body.focus_area != null ? String(body.focus_area) : undefined,
      start_date: body.start_date != null ? String(body.start_date) : undefined,
      next_review_date:
        body.next_review_date === null
          ? null
          : body.next_review_date != null
            ? String(body.next_review_date)
            : undefined,
      progress_percent: body.progress_percent != null ? Number(body.progress_percent) : undefined,
      status: body.status != null ? (body.status as PipStatus) : undefined,
      notes: body.notes === null ? null : body.notes != null ? String(body.notes) : undefined
    });
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update PIP plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
