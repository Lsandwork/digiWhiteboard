import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { hasPermission } from "@/lib/admin/permissions";
import { isAdminOrManagementRole } from "@/lib/admin/users";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createVetVisit,
  getVetVisitSummary,
  listVetVisits,
  updateVetVisit,
  type VetVisitListFilters,
  type VetVisitManagementStatus,
  type VetVisitOwnerFollowUpStatus,
  type VetVisitPaidBy
} from "@/lib/staff/vet-visits";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireVetVisitsAccess(request: Request) {
  if (!(await isAdminRequest(request))) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const canView =
    hasPermission(access, "view_vet_visits") ||
    hasPermission(access, "manage_vet_visits") ||
    isAdminOrManagementRole(session?.role);
  const canManage =
    hasPermission(access, "manage_vet_visits") || isAdminOrManagementRole(session?.role);
  if (!canView) {
    return { error: NextResponse.json({ error: "Vet Visits access required." }, { status: 403 }) };
  }
  return { session, canManage, supabase };
}

export async function GET(request: Request) {
  const gate = await requireVetVisitsAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const filters: VetVisitListFilters = {
    q: url.searchParams.get("q") ?? undefined,
    managementStatus: (url.searchParams.get("managementStatus") as VetVisitManagementStatus | "all") || "all",
    ownerFollowUp: (url.searchParams.get("ownerFollowUp") as VetVisitOwnerFollowUpStatus | "all") || "all",
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 50),
    sortBy: url.searchParams.get("sortBy") ?? "occurred_at",
    sortDir: url.searchParams.get("sortDir") === "asc" ? "asc" : "desc"
  };

  try {
    const [list, summary] = await Promise.all([
      listVetVisits(gate.supabase!, filters),
      getVetVisitSummary(gate.supabase!)
    ]);
    return NextResponse.json({ ...list, summary, canManage: gate.canManage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load vet visits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireVetVisitsAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  if (!gate.canManage) {
    return NextResponse.json({ error: "Manage Vet Visits permission required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "create");
  const actor = gate.session?.email ?? gate.session?.adminUserId ?? "admin";

  try {
    if (action === "create") {
      const record = await createVetVisit(
        gate.supabase!,
        {
          dog_name: String(body.dog_name ?? ""),
          dog_breed: body.dog_breed ? String(body.dog_breed) : null,
          owner_name: String(body.owner_name ?? ""),
          reason: String(body.reason ?? ""),
          vet_clinic: String(body.vet_clinic ?? ""),
          reported_by: String(body.reported_by ?? actor),
          reported_by_user_id: gate.session?.adminUserId ?? null,
          occurred_at: body.occurred_at ? String(body.occurred_at) : null,
          receipt_url: body.receipt_url ? String(body.receipt_url) : null,
          bill_total: body.bill_total,
          paid_by: body.paid_by === "owner" ? "owner" : "fitdog",
          assigned_to_name: body.assigned_to_name ? String(body.assigned_to_name) : "Management",
          notes: String(body.notes ?? ""),
          create_owner_follow_up: body.create_owner_follow_up !== false
        },
        actor
      );
      return NextResponse.json({ ok: true, record });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Visit id is required." }, { status: 400 });
      const record = await updateVetVisit(
        gate.supabase!,
        id,
        {
          management_status: body.management_status as VetVisitManagementStatus | undefined,
          owner_follow_up_status: body.owner_follow_up_status as VetVisitOwnerFollowUpStatus | undefined,
          assigned_to_name: body.assigned_to_name !== undefined ? String(body.assigned_to_name ?? "") || null : undefined,
          receipt_url: body.receipt_url !== undefined ? String(body.receipt_url ?? "") || null : undefined,
          bill_total: body.bill_total,
          paid_by: body.paid_by as VetVisitPaidBy | undefined,
          notes: body.notes !== undefined ? String(body.notes) : undefined,
          vet_clinic: body.vet_clinic !== undefined ? String(body.vet_clinic) : undefined,
          reason: body.reason !== undefined ? String(body.reason) : undefined,
          latest_update: body.latest_update !== undefined ? String(body.latest_update) : undefined
        },
        actor
      );
      return NextResponse.json({ ok: true, record });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vet visits action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
