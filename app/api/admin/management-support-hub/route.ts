import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canReviewManagementSupport, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import {
  applySupportItemAction,
  loadStaffSupportInbox,
  listTrainerEntriesForAdmin,
  type SupportInboxFilter
} from "@/lib/staff/management-support-admin";
import type { ManagementReportType } from "@/lib/staff/management-reports";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams): SupportInboxFilter {
  const reportType = searchParams.get("report_type");
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
    report_type: reportType ? (reportType as ManagementReportType) : undefined
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!canReviewManagementSupport(session?.role)) {
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
    return NextResponse.json({
      ...payload,
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
  const session = getAdminSessionFromRequest(request);
  if (!canReviewManagementSupport(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage support items." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const id = String(body.id ?? "");
    const actor = session?.email ?? session?.adminUserId ?? "admin";
    const supabase = getServiceSupabase();

    if (!id) return NextResponse.json({ error: "Support item id is required." }, { status: 400 });

    const updated = await applySupportItemAction(supabase, id, action, body, actor);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: `staff.management_support.${action}`,
      targetType: "management_report",
      targetId: updated.id,
      details: { status: updated.admin_status, assigned_to: updated.assigned_to }
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update support item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!canReviewManagementSupport(session?.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const item = await getManagementReportById(getServiceSupabase(), id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item });
}
