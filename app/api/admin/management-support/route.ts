import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  canAccessManagementReports,
  canSubmitWriteUp,
  canViewOwnWriteUps,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import {
  createEmployeeWriteUpReport,
  listManagementReports,
  listWriteUpsForCreator,
  type CreateEmployeeWriteUpInput
} from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin"
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor } = actorFromRequest(request);
  const role = session?.role;

  try {
    const supabase = getServiceSupabase();
    if (canAccessManagementReports(role)) {
      const reports = await listManagementReports(supabase, 100);
      return NextResponse.json({
        reports: reports.filter((report) => report.report_type === "employee_write_up" || report.report_type === "owner_complaint_dog_handler"),
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? "owner_admin"
        }
      });
    }

    if (canViewOwnWriteUps(role)) {
      const reports = await listWriteUpsForCreator(supabase, actor, 100);
      return NextResponse.json({
        reports,
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? "team_leader"
        }
      });
    }

    return NextResponse.json({ error: "You do not have permission to view write-up reports." }, { status: 403 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load write-up reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor } = actorFromRequest(request);

  if (!canSubmitWriteUp(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to submit write-ups." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action !== "create_write_up") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const input: CreateEmployeeWriteUpInput = {
      employee_name: String(body.employee_name ?? ""),
      employee_department: String(body.employee_department ?? ""),
      incident_date: String(body.incident_date ?? ""),
      incident_time: body.incident_time ? String(body.incident_time) : null,
      shift_location: body.shift_location ? String(body.shift_location) : null,
      policy_violated: body.policy_violated ? String(body.policy_violated) : null,
      incident_description: String(body.incident_description ?? ""),
      witnesses: body.witnesses ? String(body.witnesses) : null,
      prior_discussion: body.prior_discussion ? String(body.prior_discussion) : null,
      corrective_action: body.corrective_action ? String(body.corrective_action) : null,
      team_lead_signature: body.team_lead_signature ? String(body.team_lead_signature) : actor
    };

    const supabase = getServiceSupabase();
    const report = await createEmployeeWriteUpReport(supabase, input, actor);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: "staff.write_up.submit",
      targetType: "management_report",
      targetId: report.id,
      details: {
        employee_name: report.employee_name,
        status: report.status
      }
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit write-up.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
