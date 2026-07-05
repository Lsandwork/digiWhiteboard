import { NextResponse } from "next/server";
import { canAccessManagementReports, canManagePushNotices, canPushDogHandlerComplaintNotice, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { appendStaffOpsActivityEntries } from "@/lib/staff/admin-ops";
import { createDogHandlerComplaintReport, listManagementReports } from "@/lib/staff/management-reports";
import {
  buildDogHandlerComplaintNoticeInput,
  clearActiveStaffPushNotice,
  createAndPushStaffNotice,
  createStaffPushNotice,
  DEFAULT_STAFF_PUSH_NOTICES,
  DOG_HANDLER_COMPLAINT_MESSAGE,
  listStaffPushNotices,
  loadActiveStaffPushNotice,
  pushStaffNoticeById,
  sanitizeDogHandlerName
} from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage Push Notices." }, { status: 403 });
}

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin"
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session } = actorFromRequest(request);
  if (!canManagePushNotices(session?.role)) return forbiddenResponse();

  try {
    const supabase = getServiceSupabase();
    const [activeNotice, notices, managementReports] = await Promise.all([
      loadActiveStaffPushNotice(supabase),
      listStaffPushNotices(supabase),
      canAccessManagementReports(session?.role) ? listManagementReports(supabase) : Promise.resolve([])
    ]);

    return NextResponse.json({
      activeNotice,
      notices,
      defaultNotices: DEFAULT_STAFF_PUSH_NOTICES,
      managementReports: canAccessManagementReports(session?.role) ? managementReports : undefined,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? "owner_admin"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Push Notices.";
    return NextResponse.json({ activeNotice: null, notices: [], defaultNotices: DEFAULT_STAFF_PUSH_NOTICES, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, actor } = actorFromRequest(request);
  if (!canManagePushNotices(session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "create");
    const supabase = getServiceSupabase();

    if (action === "clear") {
      await clearActiveStaffPushNotice(supabase, actor);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.push_notice.clear",
        targetType: "staff_push_notice",
        details: {}
      });
      return NextResponse.json({ ok: true, activeNotice: null });
    }

    if (action === "push_dog_handler_complaint") {
      if (!canPushDogHandlerComplaintNotice(session?.role)) {
        return NextResponse.json({ error: "You do not have permission to push this notice." }, { status: 403 });
      }

      const dogHandlerName = sanitizeDogHandlerName(body.dog_handler_name);
      if (!dogHandlerName) {
        return NextResponse.json({ error: "Please enter the dog handler name before pushing this notice." }, { status: 400 });
      }

      const notice = await createAndPushStaffNotice(
        supabase,
        buildDogHandlerComplaintNoticeInput(dogHandlerName, body.display_duration_minutes),
        actor
      );

      const report = await createDogHandlerComplaintReport(supabase, {
        dogHandlerName,
        summary: DOG_HANDLER_COMPLAINT_MESSAGE,
        pushNoticeId: notice.id,
        actor
      });

      await appendStaffOpsActivityEntries(supabase, [
        {
          activity_type: "push_notice.dog_handler",
          title: `Owner Complaint - Dog Handler notice pushed for ${dogHandlerName}.`,
          description: DOG_HANDLER_COMPLAINT_MESSAGE,
          source_table: "staff_push_notices",
          source_id: notice.id,
          created_by: actor
        },
        {
          activity_type: "management_report.created",
          title: `Management report created for Owner Complaint - Dog Handler: ${dogHandlerName}.`,
          description: "Employee write-up documentation report opened for admin review.",
          source_table: "management_reports",
          source_id: report.id,
          created_by: actor
        }
      ]);

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.push_notice.push_dog_handler_complaint",
        targetType: "staff_push_notice",
        targetId: notice.id,
        details: { dog_handler_name: dogHandlerName, report_id: report.id }
      });

      return NextResponse.json({ notice, report });
    }

    if (action === "push_default") {
      const title = String(body.title ?? "").trim();
      const defaultNotice = DEFAULT_STAFF_PUSH_NOTICES.find((notice) => notice.title === title);
      if (!defaultNotice) return NextResponse.json({ error: "Unknown default notice." }, { status: 400 });

      const notice = await createAndPushStaffNotice(
        supabase,
        {
          ...defaultNotice,
          expires_at: body.expires_at,
          display_duration_minutes: body.display_duration_minutes
        },
        actor
      );

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.push_notice.push_default",
        targetType: "staff_push_notice",
        targetId: notice.id,
        details: { title: notice.title, priority: notice.priority }
      });

      return NextResponse.json({ notice });
    }

    if (action === "push_existing") {
      const id = String(body.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "Notice id is required." }, { status: 400 });

      const notice = await pushStaffNoticeById(supabase, id, actor, body.expires_at);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.push_notice.push_existing",
        targetType: "staff_push_notice",
        targetId: notice.id,
        details: { title: notice.title, priority: notice.priority }
      });
      return NextResponse.json({ notice });
    }

    if (action === "create_and_push") {
      const notice = await createAndPushStaffNotice(supabase, body, actor);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.push_notice.create_and_push",
        targetType: "staff_push_notice",
        targetId: notice.id,
        details: { title: notice.title, priority: notice.priority }
      });
      return NextResponse.json({ notice });
    }

    const notice = await createStaffPushNotice(supabase, body, actor);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.push_notice.create",
      targetType: "staff_push_notice",
      targetId: notice.id,
      details: { title: notice.title, priority: notice.priority }
    });

    return NextResponse.json({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Push Notice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
