import { NextResponse } from "next/server";
import { resolveSessionDisplayName } from "@/lib/admin/actor-display";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { assertHrWriteUpUploadFile } from "@/lib/hr/upload-write-up";
import { toHrRecord } from "@/lib/hr/records";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import { createManualUploadedWriteUp, updateManagementReport } from "@/lib/staff/management-reports";
import { saveWriteUpAttachment } from "@/lib/staff/write-up-pdf-store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to upload HR write-ups." }, { status: 403 });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a write-up file to upload." }, { status: 400 });
    }

    const meta = assertHrWriteUpUploadFile({ name: file.name, type: file.type, size: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actor = session?.email ?? session?.adminUserId ?? "admin";
    const actorDisplayName =
      (await resolveSessionDisplayName(supabase, session)) || access?.displayLabel || actor;

    let report = await createManualUploadedWriteUp(
      supabase,
      {
        employee_name: String(form.get("employee_name") ?? ""),
        employee_department: String(form.get("employee_department") ?? ""),
        violation_date: String(form.get("violation_date") ?? "").trim() || null,
        documented_by: String(form.get("documented_by") ?? "").trim() || actorDisplayName,
        statement_of_violation: String(form.get("notes") ?? "").trim() || null
      },
      actor,
      actorDisplayName
    );

    const saved = await saveWriteUpAttachment(supabase, report.id, bytes, {
      filename: `${report.id.slice(0, 8)}-${meta.filename}`,
      contentType: meta.contentType,
      uploaded: true
    });

    report = await updateManagementReport(supabase, report.id, {
      write_up_details: {
        ...report.write_up_details!,
        pdf_filename: saved.filename,
        pdf_generated_at: saved.generated_at,
        hr_tracked: true
      },
      related_notes: "Manually uploaded write-up (entered outside RuffOps)."
    });

    await dispatchStaffOpsNotificationEvent(supabase, {
      eventType: "auto_issue",
      sourceTable: "management_reports",
      sourceId: report.id,
      sourceTab: "push_notices",
      title: report.title,
      body: report.summary.slice(0, 1200),
      priority: "Urgent",
      urgent: true,
      needsManagementReview: true,
      actor: actorDisplayName
    });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: "staff.write_up.upload",
      targetType: "management_report",
      targetId: report.id,
      details: {
        employee_name: report.employee_name,
        filename: saved.filename,
        content_type: saved.content_type
      }
    });

    return NextResponse.json({ ok: true, report, record: toHrRecord(report) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload write-up.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
