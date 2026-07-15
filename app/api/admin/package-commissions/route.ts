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
import { listAdminUsers } from "@/lib/admin/users";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import {
  addPackageCommissionComment,
  confirmPackageCommissionRow,
  createPackageCommissionRow,
  deletePackageCommissionRow,
  exportPackageCommissionsCsv,
  importPackageCommissionCsv,
  listPackageCommissionsForViewer,
  setPackageCommissionStatus,
  summarizeCommissionRows,
  trainerOwnsCommissionRow,
  updatePackageCommissionRow,
  type PackageCommissionStatus
} from "@/lib/staff/package-commissions";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function packageCommissionViewer(session: ReturnType<typeof getAdminSessionFromRequest>) {
  return {
    role: session?.role ?? null,
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null
  };
}

async function resolveAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  const canView =
    canViewPackageCommissions(role) ||
    hasPermission(access, "view_package_commissions") ||
    hasPermission(access, "manage_package_commissions");
  const canManage =
    canManagePackageCommissions(role) || hasPermission(access, "manage_package_commissions");
  const canComment = role === "trainer" || hasPermission(access, "comment_package_commissions") || canManage;

  return { session, role, supabase, access, canView, canManage, canComment };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, role, supabase, canView, canManage, canComment } = await resolveAccess(request);
  if (!canView) {
    return NextResponse.json({ error: "You do not have permission to view package commissions." }, { status: 403 });
  }

  try {
    const viewer = packageCommissionViewer(session);
    const rows = await listPackageCommissionsForViewer(supabase, viewer);
    const trainers = canManage
      ? (await listAdminUsers(supabase))
          .filter((user) => user.role === "trainer" && user.status !== "disabled")
          .map((user) => ({
            id: user.id,
            full_name: user.full_name,
            email: user.email
          }))
      : [];

    return NextResponse.json({
      rows,
      summary: summarizeCommissionRows(rows),
      trainers,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null
      },
      canManage,
      canComment
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load package commissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, role, supabase, canManage, canComment } = await resolveAccess(request);
  const actor = session?.email ?? session?.adminUserId ?? "admin";
  const actorMeta = {
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    name: session?.email ?? null
  };
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "create");

  try {
    if (action === "comment") {
      if (!canComment) {
        return NextResponse.json({ error: "You do not have permission to comment on package commissions." }, { status: 403 });
      }

      const rowId = String(body.row_id ?? "");
      const viewer = packageCommissionViewer(session);
      const rows = await listPackageCommissionsForViewer(supabase, viewer);
      const target = rows.find((row) => row.id === rowId);
      if (!target || !trainerOwnsCommissionRow(target, viewer)) {
        return NextResponse.json({ error: "Package commission row not found." }, { status: 404 });
      }

      const concernType = body.concern_type ? String(body.concern_type) : null;
      const result = await addPackageCommissionComment(
        supabase,
        rowId,
        actor,
        String(body.body ?? ""),
        { concern_type: concernType }
      );

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

    if (!canManage) {
      return NextResponse.json({ error: "You do not have permission to manage package commissions." }, { status: 403 });
    }

    if (action === "create") {
      const row = await createPackageCommissionRow(supabase, {
        ...body,
        created_by: actor
      });
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.create",
        targetType: "package_commissions",
        targetId: row.id,
        details: { dog_name: row.dog_name, trainer_name: row.trainer_name, status: row.status }
      });
      return NextResponse.json({ ok: true, row });
    }

    if (action === "update") {
      const row = await updatePackageCommissionRow(supabase, String(body.id ?? ""), body);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.update",
        targetType: "package_commissions",
        targetId: row.id,
        details: { status: row.status, trainer_name: row.trainer_name }
      });
      return NextResponse.json({ ok: true, row });
    }

    if (action === "confirm") {
      const row = await confirmPackageCommissionRow(supabase, String(body.id ?? ""), actorMeta);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.confirm",
        targetType: "package_commissions",
        targetId: row.id,
        details: { confirmed_by: row.confirmed_by, status: row.status }
      });
      return NextResponse.json({ ok: true, row });
    }

    if (action === "set_status") {
      const status = String(body.status ?? "") as PackageCommissionStatus;
      const row = await setPackageCommissionStatus(supabase, String(body.id ?? ""), status, actorMeta);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.set_status",
        targetType: "package_commissions",
        targetId: row.id,
        details: { status: row.status }
      });
      return NextResponse.json({ ok: true, row });
    }

    if (action === "mark_paid") {
      const row = await setPackageCommissionStatus(supabase, String(body.id ?? ""), "Paid", actorMeta);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.mark_paid",
        targetType: "package_commissions",
        targetId: row.id,
        details: { status: row.status }
      });
      return NextResponse.json({ ok: true, row });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      await deletePackageCommissionRow(supabase, id);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.delete",
        targetType: "package_commissions",
        targetId: id
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "import_csv") {
      const trainers = (await listAdminUsers(supabase))
        .filter((user) => user.role === "trainer" && user.status !== "disabled")
        .map((user) => ({
          id: user.id,
          full_name: user.full_name,
          email: user.email
        }));
      const result = await importPackageCommissionCsv(supabase, String(body.csv ?? ""), { trainers });
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.import",
        targetType: "package_commissions",
        targetId: undefined,
        details: { count: result.created.length, error_count: result.errors.length }
      });
      return NextResponse.json({
        ok: true,
        rows: result.created,
        errors: result.errors,
        imported: result.created.length,
        failed: result.errors.length
      });
    }

    if (action === "export_csv") {
      const rows = await listPackageCommissionsForViewer(supabase, packageCommissionViewer(session));
      return NextResponse.json({ ok: true, csv: exportPackageCommissionsCsv(rows) });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update package commissions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
