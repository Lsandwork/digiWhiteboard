import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { hasPermission } from "@/lib/admin/permissions";
import { isAdminOrManagementRole, isFrontDeskCoordinatorRole } from "@/lib/admin/users";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createVipAutoBookClient,
  getLatestVipDirectorySync,
  getVipAutoBookSummary,
  listVipAutoBookClients,
  searchVipDirectory,
  syncVipFitdogDirectory,
  updateVipAutoBookClient,
  type VipAutoBookListFilters,
  type VipCadence,
  type VipClientStatus,
  type VipServiceKind
} from "@/lib/staff/vip-auto-book";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireVipAutoBookAccess(request: Request) {
  if (!(await isAdminRequest(request))) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const canView =
    hasPermission(access, "view_vip_auto_book") ||
    hasPermission(access, "manage_vip_auto_book") ||
    isAdminOrManagementRole(session?.role) ||
    isFrontDeskCoordinatorRole(session?.role);
  const canManage =
    hasPermission(access, "manage_vip_auto_book") ||
    isAdminOrManagementRole(session?.role) ||
    isFrontDeskCoordinatorRole(session?.role);
  if (!canView) {
    return { error: NextResponse.json({ error: "VIP Auto Book access required." }, { status: 403 }) };
  }
  return { session, canManage, supabase };
}

export async function GET(request: Request) {
  const gate = await requireVipAutoBookAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  try {
    if (action === "search") {
      const q = url.searchParams.get("q") ?? "";
      const hits = await searchVipDirectory(gate.supabase!, q, Number(url.searchParams.get("limit") ?? 12));
      return NextResponse.json({ hits });
    }

    if (action === "sync-status") {
      const latest = await getLatestVipDirectorySync(gate.supabase!);
      return NextResponse.json({ latest });
    }

    const filters: VipAutoBookListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      status: (url.searchParams.get("status") as VipClientStatus | "all") || "all",
      cadence: (url.searchParams.get("cadence") as VipCadence | "all") || "all",
      serviceKind: (url.searchParams.get("serviceKind") as VipServiceKind | "all") || "all",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 50),
      sortBy: url.searchParams.get("sortBy") ?? "updated_at",
      sortDir: url.searchParams.get("sortDir") === "asc" ? "asc" : "desc"
    };

    const [list, summary, latestSync] = await Promise.all([
      listVipAutoBookClients(gate.supabase!, filters),
      getVipAutoBookSummary(gate.supabase!),
      getLatestVipDirectorySync(gate.supabase!)
    ]);
    return NextResponse.json({ ...list, summary, latestSync, canManage: gate.canManage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load VIP Auto Book.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireVipAutoBookAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  if (!gate.canManage) {
    return NextResponse.json({ error: "Manage VIP Auto Book permission required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "create");
  const actor = gate.session?.email ?? gate.session?.adminUserId ?? "admin";

  try {
    if (action === "sync_directory") {
      const result = await syncVipFitdogDirectory(gate.supabase!);
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    }

    if (action === "create") {
      const record = await createVipAutoBookClient(gate.supabase!, {
        fitdogOwnerId: body.fitdogOwnerId ? String(body.fitdogOwnerId) : null,
        fitdogDogId: body.fitdogDogId ? String(body.fitdogDogId) : null,
        ownerName: String(body.ownerName ?? body.owner_name ?? ""),
        ownerEmail: body.ownerEmail != null ? String(body.ownerEmail) : body.owner_email != null ? String(body.owner_email) : null,
        ownerPhone: body.ownerPhone != null ? String(body.ownerPhone) : body.owner_phone != null ? String(body.owner_phone) : null,
        dogName: String(body.dogName ?? body.dog_name ?? ""),
        dogBreed: body.dogBreed != null ? String(body.dogBreed) : body.dog_breed != null ? String(body.dog_breed) : null,
        serviceKind: body.serviceKind as VipServiceKind | undefined,
        serviceName: body.serviceName != null ? String(body.serviceName) : undefined,
        cadence: body.cadence as VipCadence | undefined,
        daysOfWeek: Array.isArray(body.daysOfWeek)
          ? body.daysOfWeek.map((day) => Number(day))
          : Array.isArray(body.days_of_week)
            ? body.days_of_week.map((day) => Number(day))
            : [],
        monthlyWeek: body.monthlyWeek != null ? Number(body.monthlyWeek) : null,
        preferredTime: body.preferredTime != null ? String(body.preferredTime) : null,
        startsOn: body.startsOn != null ? String(body.startsOn) : null,
        endsOn: body.endsOn != null ? String(body.endsOn) : null,
        notes: body.notes != null ? String(body.notes) : "",
        createdByUserId: gate.session?.adminUserId ?? null,
        createdByName: actor
      });
      return NextResponse.json({ ok: true, record });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Client id is required." }, { status: 400 });
      const record = await updateVipAutoBookClient(gate.supabase!, id, {
        ownerName: body.ownerName !== undefined ? String(body.ownerName) : undefined,
        ownerEmail: body.ownerEmail !== undefined ? (body.ownerEmail ? String(body.ownerEmail) : null) : undefined,
        ownerPhone: body.ownerPhone !== undefined ? (body.ownerPhone ? String(body.ownerPhone) : null) : undefined,
        dogName: body.dogName !== undefined ? String(body.dogName) : undefined,
        dogBreed: body.dogBreed !== undefined ? (body.dogBreed ? String(body.dogBreed) : null) : undefined,
        serviceKind: body.serviceKind as VipServiceKind | undefined,
        serviceName: body.serviceName !== undefined ? String(body.serviceName) : undefined,
        cadence: body.cadence as VipCadence | undefined,
        daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek.map((day) => Number(day)) : undefined,
        monthlyWeek: body.monthlyWeek !== undefined ? (body.monthlyWeek == null ? null : Number(body.monthlyWeek)) : undefined,
        preferredTime: body.preferredTime !== undefined ? (body.preferredTime ? String(body.preferredTime) : null) : undefined,
        startsOn: body.startsOn !== undefined ? String(body.startsOn) : undefined,
        endsOn: body.endsOn !== undefined ? (body.endsOn ? String(body.endsOn) : null) : undefined,
        status: body.status as VipClientStatus | undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined
      });
      return NextResponse.json({ ok: true, record });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIP Auto Book request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
