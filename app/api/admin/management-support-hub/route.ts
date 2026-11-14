import { NextResponse } from "next/server";
import { resolveSessionDisplayName } from "@/lib/admin/actor-display";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canReviewManagementSupportWithAccess, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  applySupportItemAction,
  loadStaffSupportInbox,
  listTrainerEntriesForAdmin,
  SupportNotificationError,
  type SupportInboxFilter
} from "@/lib/staff/management-support-admin";
import type { ManagementReportType } from "@/lib/staff/management-reports";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ASSIGNABLE_ROLES = new Set(["owner_admin", "manager_admin", "assistant_manager"]);

async function listSupportAssignees(supabase: ReturnType<typeof getServiceSupabase>) {
  try {
    const { data, error } = await supabase
      .from("admin_users")
      .select("id, full_name, email, role, status")
      .eq("status", "active");
    if (error || !data) return [];
    return data
      .filter((row) => ASSIGNABLE_ROLES.has(String(row.role)))
      .map((row) => ({
        id: String(row.id),
        name: String(row.full_name || row.email || "Manager"),
        role: String(row.role)
      }))
      .filter((row) => row.name.trim());
  } catch {
    return [];
  }
}

function parseFilters(searchParams: URLSearchParams): SupportInboxFilter {
  const reportTypeRaw = searchParams.get("report_type") ?? searchParams.get("report_types");
  const reportTypes = reportTypeRaw
    ? reportTypeRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value as ManagementReportType)
    : undefined;

  return {
    query: searchParams.get("query") ?? undefined,
    department: searchParams.get("department") ?? undefined,
    item_type: searchParams.get("item_type") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    assigned_to: searchParams.get("assigned_to") ?? undefined,
    submitted_by: searchParams.get("submitted_by") ?? undefined,
    card: searchParams.get("card") ?? undefined,
    date_from: searchParams.get("date_from") ?? undefined,
    date_to: searchParams.get("date_to") ?? undefined,
    report_type: reportTypes?.length === 1 ? reportTypes[0] : reportTypes
  };
}

async function actorContext(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access } = await actorContext(request);
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to review management support." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "hub";
    const filters = parseFilters(searchParams);

    if (view === "trainer_entries") {
      const entries = await listTrainerEntriesForAdmin(supabase);
      return NextResponse.json({
        entries,
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: session?.role ?? "owner_admin"
        }
      });
    }

    const payload = await loadStaffSupportInbox(supabase, filters);
    const assignees = await listSupportAssignees(supabase);
    return NextResponse.json({
      ...payload,
      assignees,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? "owner_admin"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load management support hub.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access } = await actorContext(request);
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage support items." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const id = String(body.id ?? "");
    const supabase = getServiceSupabase();
    const actor = (await resolveSessionDisplayName(supabase, session)) ?? session?.email ?? session?.adminUserId ?? "admin";

    if (!id) return NextResponse.json({ error: "Support item id is required." }, { status: 400 });

    let updated;
    let notificationDelivered = true;
    let warning: string | null = null;
    try {
      updated = await applySupportItemAction(supabase, id, action, body, actor);
    } catch (error) {
      if (!(error instanceof SupportNotificationError)) throw error;
      updated = error.report;
      notificationDelivered = false;
      warning = error.message;
    }

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: `staff.management_support.${action}`,
      targetType: "management_report",
      targetId: updated.id,
      details: { status: updated.admin_status, assigned_to: updated.assigned_to }
    });

    return NextResponse.json({ ok: true, item: updated, notificationDelivered, warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update support item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access } = await actorContext(request);
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const item = await getManagementReportById(getServiceSupabase(), id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item });
}
