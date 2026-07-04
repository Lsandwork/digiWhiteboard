import { NextResponse } from "next/server";
import { canManageStaffDirectory, canManageStaffOperations, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { createAndPushStaffNotice } from "@/lib/staff/push-notices";
import {
  createActiveIssue,
  createCrossoverMessage,
  createStaffDirectoryMember,
  deleteStaffDirectoryMember,
  createOwnerFollowUp,
  listStaffOps,
  replyToCrossoverMessage,
  updateActiveIssue,
  updateCrossoverMessage,
  updateStaffDirectoryMember,
  updateOwnerFollowUp
} from "@/lib/staff/admin-ops";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage Staff Admin records." }, { status: 403 });
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
  if (!canManageStaffOperations(session?.role)) return forbiddenResponse();

  try {
    const state = await listStaffOps(getServiceSupabase());
    return NextResponse.json({
      ...state,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? "owner_admin"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Staff Admin records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor } = actorFromRequest(request);
  if (!canManageStaffOperations(session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = getServiceSupabase();
    let result: unknown;
    let auditAction = "staff.ops.action";

    if (action === "create_crossover") {
      result = await createCrossoverMessage(supabase, body, actor);
      auditAction = "staff.crossover.create";
    } else if (action === "update_crossover") {
      const id = String(body.id ?? "");
      result = await updateCrossoverMessage(supabase, id, body, actor);
      auditAction = "staff.crossover.update";
    } else if (action === "reply_crossover") {
      const id = String(body.id ?? "");
      result = await replyToCrossoverMessage(supabase, id, body.message, actor);
      auditAction = "staff.crossover.reply";
    } else if (action === "create_follow_up") {
      result = await createOwnerFollowUp(supabase, body, actor);
      auditAction = "staff.follow_up.create";
    } else if (action === "update_follow_up") {
      const id = String(body.id ?? "");
      result = await updateOwnerFollowUp(supabase, id, body, actor);
      auditAction = "staff.follow_up.update";
    } else if (action === "create_issue") {
      result = await createActiveIssue(supabase, body, actor);
      auditAction = "staff.issue.create";
    } else if (action === "update_issue") {
      const id = String(body.id ?? "");
      result = await updateActiveIssue(supabase, id, body, actor);
      auditAction = "staff.issue.update";
    } else if (action === "create_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return forbiddenResponse();
      result = await createStaffDirectoryMember(supabase, body, actor);
      auditAction = "staff.directory.create";
    } else if (action === "update_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return forbiddenResponse();
      const id = String(body.id ?? "");
      result = await updateStaffDirectoryMember(supabase, id, body, actor);
      auditAction = "staff.directory.update";
    } else if (action === "delete_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return forbiddenResponse();
      const id = String(body.id ?? "");
      await deleteStaffDirectoryMember(supabase, id, actor);
      result = { id };
      auditAction = "staff.directory.delete";
    } else if (action === "push_to_whiteboard") {
      const title = String(body.title ?? "").trim();
      const message = String(body.message ?? "").trim();
      if (!title) return NextResponse.json({ error: "Title is required to push to whiteboard." }, { status: 400 });
      result = await createAndPushStaffNotice(
        supabase,
        {
          title,
          message,
          priority: body.priority === "Critical" || body.priority === "High" ? "urgent" : "important",
          display_mode: body.priority === "Critical" || body.priority === "High" ? "urgent" : "normal",
          display_duration_minutes: body.display_duration_minutes ?? 5
        },
        actor
      );
      auditAction = "staff.ops.push_to_whiteboard";
    } else {
      return NextResponse.json({ error: "Unsupported Staff Admin action." }, { status: 400 });
    }

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: auditAction,
      targetType: "staff_operations",
      details: { action }
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Staff Admin record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
