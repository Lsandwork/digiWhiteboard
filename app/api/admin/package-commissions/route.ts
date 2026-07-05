import { NextResponse } from "next/server";
import {
  canManagePackageCommissions,
  canViewPackageCommissions,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import {
  addPackageCommissionComment,
  createPackageCommissionRow,
  deletePackageCommissionRow,
  exportPackageCommissionsCsv,
  importPackageCommissionCsv,
  listPackageCommissions,
  updatePackageCommissionRow
} from "@/lib/staff/package-commissions";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  if (!canViewPackageCommissions(role) && !canManagePackageCommissions(role)) {
    return NextResponse.json({ error: "You do not have permission to view package commissions." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const rows = await listPackageCommissions(supabase);
    const access = session?.adminUserId
      ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
      : null;

    return NextResponse.json({
      rows,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null,
        access
      },
      canManage: canManagePackageCommissions(role) || hasPermission(access, "manage_package_commissions"),
      canComment: role === "trainer" || hasPermission(access, "comment_package_commissions")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load package commissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  const actor = session?.email ?? session?.adminUserId ?? "admin";
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "create");

  try {
    const supabase = getServiceSupabase();

    if (action === "comment") {
      if (role !== "trainer" && !canManagePackageCommissions(role)) {
        return NextResponse.json({ error: "You do not have permission to comment on package commissions." }, { status: 403 });
      }
      const result = await addPackageCommissionComment(supabase, String(body.row_id ?? ""), actor, String(body.body ?? ""));

      await dispatchStaffOpsNotificationEvent(supabase, {
        eventType: "auto_issue",
        sourceTable: "package_commissions",
        sourceId: result.row.id,
        sourceTab: "push_notices",
        title: "Package Commission Comment",
        body: `${actor} commented on ${result.row.dog_name} (${result.row.package_type}): ${result.comment.body}`,
        priority: "Normal",
        needsManagementReview: true,
        actor
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (!canManagePackageCommissions(role)) {
      return NextResponse.json({ error: "You do not have permission to manage package commissions." }, { status: 403 });
    }

    if (action === "create") {
      const row = await createPackageCommissionRow(supabase, body);
      return NextResponse.json({ ok: true, row });
    }

    if (action === "update") {
      const row = await updatePackageCommissionRow(supabase, String(body.id ?? ""), body);
      return NextResponse.json({ ok: true, row });
    }

    if (action === "delete") {
      await deletePackageCommissionRow(supabase, String(body.id ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "import_csv") {
      const created = await importPackageCommissionCsv(supabase, String(body.csv ?? ""));
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.import",
        targetType: "package_commissions",
        targetId: undefined,
        details: { count: created.length }
      });
      return NextResponse.json({ ok: true, rows: created });
    }

    if (action === "export_csv") {
      const rows = await listPackageCommissions(supabase);
      return NextResponse.json({ ok: true, csv: exportPackageCommissionsCsv(rows) });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update package commissions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
