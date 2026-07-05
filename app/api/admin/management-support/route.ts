import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  canAccessManagementReports,
  canSubmitGroomerComplaint,
  canSubmitTrainerComplaint,
  canSubmitWriteUp,
  canViewOwnGroomerSubmissions,
  canViewOwnTrainerSubmissions,
  canViewOwnWriteUps,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import {
  createEmployeeWriteUpReport,
  createGroomerComplaintReport,
  createGroomerRequestReport,
  createTrainerComplaintReport,
  createTrainerRequestReport,
  listGroomerSubmissionsForCreator,
  listTrainerSubmissionsForCreator,
  listManagementReports,
  listWriteUpsForCreator,
  updateManagementReport,
  type CreateEmployeeWriteUpInput
} from "@/lib/staff/management-reports";
import { buildWarningNoticeTextReport } from "@/lib/staff/warning-notice-text-report";
import { generateWarningNoticePdf } from "@/lib/staff/warning-notice-pdf";
import type { WarningNoticeViolationType } from "@/lib/staff/warning-notice-constants";
import { saveWriteUpPdf } from "@/lib/staff/write-up-pdf-store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin"
  };
}

const ADMIN_REPORT_TYPES = new Set([
  "employee_write_up",
  "owner_complaint_dog_handler",
  "groomer_complaint",
  "groomer_request",
  "trainer_complaint",
  "trainer_request"
]);

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor } = actorFromRequest(request);
  const role = session?.role;

  try {
    const supabase = getServiceSupabase();
    if (canAccessManagementReports(role)) {
      const reports = await listManagementReports(supabase, 100);
      return NextResponse.json({
        reports: reports.filter((report) => ADMIN_REPORT_TYPES.has(report.report_type)),
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? "owner_admin"
        }
      });
    }

    if (canViewOwnGroomerSubmissions(role)) {
      const [complaints, requests] = await Promise.all([
        listGroomerSubmissionsForCreator(supabase, actor, "groomer_complaint", 100),
        listGroomerSubmissionsForCreator(supabase, actor, "groomer_request", 100)
      ]);
      return NextResponse.json({
        reports: [...complaints, ...requests],
        complaints,
        requests,
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? "groomer"
        }
      });
    }

    if (canViewOwnTrainerSubmissions(role)) {
      const [complaints, requests] = await Promise.all([
        listTrainerSubmissionsForCreator(supabase, actor, "trainer_complaint", 100),
        listTrainerSubmissionsForCreator(supabase, actor, "trainer_request", 100)
      ]);
      return NextResponse.json({
        reports: [...complaints, ...requests],
        complaints,
        requests,
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? "trainer"
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

    return NextResponse.json({ error: "You do not have permission to view management support." }, { status: 403 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load management support.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor } = actorFromRequest(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = getServiceSupabase();

    if (action === "create_write_up") {
      if (!canSubmitWriteUp(session?.role)) {
        return NextResponse.json({ error: "You do not have permission to submit write-ups." }, { status: 403 });
      }

      const violationTypes = Array.isArray(body.violation_types)
        ? body.violation_types.filter((type): type is WarningNoticeViolationType => typeof type === "string")
        : [];

      const input: CreateEmployeeWriteUpInput = {
        employee_name: String(body.employee_name ?? ""),
        employee_department: String(body.employee_department ?? ""),
        violation_date: String(body.violation_date ?? body.incident_date ?? ""),
        violation_time: body.violation_time ? String(body.violation_time) : body.incident_time ? String(body.incident_time) : null,
        documented_by: body.documented_by ? String(body.documented_by) : actor,
        violation_types: violationTypes,
        violation_other: body.violation_other ? String(body.violation_other) : null,
        statement_of_violation: String(body.statement_of_violation ?? body.incident_description ?? ""),
        employee_statement: body.employee_statement ? String(body.employee_statement) : null,
        date_of_warning: body.date_of_warning ? String(body.date_of_warning) : null,
        type_of_warning: body.type_of_warning ? String(body.type_of_warning) : null,
        employee_number: body.employee_number ? String(body.employee_number) : null,
        previous_warnings: Array.isArray(body.previous_warnings)
          ? body.previous_warnings.map((row) => ({
              date: String((row as { date?: string }).date ?? ""),
              verbal: Boolean((row as { verbal?: boolean }).verbal),
              written: Boolean((row as { written?: boolean }).written),
              by_whom: String((row as { by_whom?: string }).by_whom ?? ""),
              violation_details: String((row as { violation_details?: string }).violation_details ?? "")
            }))
          : [],
        action_to_be_taken: body.action_to_be_taken ? String(body.action_to_be_taken) : body.corrective_action ? String(body.corrective_action) : null,
        employee_signature: body.employee_signature ? String(body.employee_signature) : null,
        employee_signature_date: body.employee_signature_date ? String(body.employee_signature_date) : null,
        manager_signature: body.manager_signature ? String(body.manager_signature) : body.team_lead_signature ? String(body.team_lead_signature) : actor,
        manager_signature_date: body.manager_signature_date ? String(body.manager_signature_date) : null
      };

      let report = await createEmployeeWriteUpReport(supabase, input, actor);

      const text_report = buildWarningNoticeTextReport(report.write_up_details!, {
        reportId: report.id,
        submittedAt: report.created_at,
        submittedBy: actor
      });

      const pdfBytes = await generateWarningNoticePdf(report.write_up_details!);
      const pdfMeta = await saveWriteUpPdf(supabase, report.id, report.employee_name ?? "employee", pdfBytes);

      report = await updateManagementReport(supabase, report.id, {
        write_up_details: {
          ...report.write_up_details!,
          text_report,
          pdf_filename: pdfMeta.filename,
          pdf_generated_at: pdfMeta.generated_at,
          hr_tracked: true
        },
        related_notes: "HR tracked warning notice with generated PDF."
      });

      await dispatchStaffOpsNotificationEvent(supabase, {
        eventType: "auto_issue",
        sourceTable: "management_reports",
        sourceId: report.id,
        sourceTab: "push_notices",
        title: report.title,
        body: text_report.slice(0, 1200),
        priority: "Urgent",
        urgent: true,
        needsManagementReview: true,
        actor
      });

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
    }

    if (action === "create_groomer_complaint" || action === "create_groomer_request") {
      if (!canSubmitGroomerComplaint(session?.role)) {
        return NextResponse.json({ error: "You do not have permission to submit this form." }, { status: 403 });
      }

      const description = String(body.description ?? "").trim();
      const report = action === "create_groomer_complaint"
        ? await createGroomerComplaintReport(supabase, description, actor)
        : await createGroomerRequestReport(supabase, description, actor);

      await dispatchStaffOpsNotificationEvent(supabase, {
        eventType: "auto_issue",
        sourceTable: "management_reports",
        sourceId: report.id,
        sourceTab: "push_notices",
        title: report.title,
        body: report.summary,
        priority: "Urgent",
        urgent: true,
        needsManagementReview: true,
        actor
      });

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: action === "create_groomer_complaint" ? "staff.groomer_complaint.submit" : "staff.groomer_request.submit",
        targetType: "management_report",
        targetId: report.id,
        details: { status: report.status }
      });

      return NextResponse.json({ ok: true, report });
    }

    if (action === "create_trainer_complaint" || action === "create_trainer_request") {
      if (!canSubmitTrainerComplaint(session?.role)) {
        return NextResponse.json({ error: "You do not have permission to submit this form." }, { status: 403 });
      }

      const description = String(body.description ?? "").trim();
      const report = action === "create_trainer_complaint"
        ? await createTrainerComplaintReport(supabase, description, actor)
        : await createTrainerRequestReport(supabase, description, actor);

      await dispatchStaffOpsNotificationEvent(supabase, {
        eventType: "auto_issue",
        sourceTable: "management_reports",
        sourceId: report.id,
        sourceTab: "push_notices",
        title: report.title,
        body: report.summary,
        priority: "Urgent",
        urgent: true,
        needsManagementReview: true,
        actor
      });

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: action === "create_trainer_complaint" ? "staff.trainer_complaint.submit" : "staff.trainer_request.submit",
        targetType: "management_report",
        targetId: report.id,
        details: { status: report.status }
      });

      return NextResponse.json({ ok: true, report });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit form.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
