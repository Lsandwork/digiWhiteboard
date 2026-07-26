import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { displayNameForUser } from "@/lib/operations-checklist/roles";
import {
  applyOperationsChecklistAction,
  exportOperationsChecklist,
  listInstanceEvents,
  loadOperationsChecklistPayload
} from "@/lib/operations-checklist/server";

export const dynamic = "force-dynamic";

async function resolveActor(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) return null;
  const supabase = getServiceSupabase();
  const adminUserId = normalizeAdminUserId(session.adminUserId);
  let name = session.email;
  if (adminUserId) {
    const { data } = await supabase
      .from("admin_users")
      .select("id, email, full_name, role")
      .eq("id", adminUserId)
      .maybeSingle();
    if (data) name = displayNameForUser(data);
  }
  if (!adminUserId) return null;
  return {
    userId: adminUserId,
    email: session.email,
    name,
    role: session.role ?? null
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Signed-in user record required." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const instanceId = url.searchParams.get("instanceId");
    const exportMode = url.searchParams.get("export");
    const shiftDate = url.searchParams.get("shiftDate") ?? undefined;
    const supabase = getServiceSupabase();

    if (instanceId) {
      const events = await listInstanceEvents(supabase, instanceId);
      return NextResponse.json({ events });
    }

    if (exportMode === "day" || exportMode === "week") {
      const csv = await exportOperationsChecklist(supabase, {
        shiftDate,
        range: exportMode
      });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="operations-checklist-${exportMode}-${shiftDate || "current"}.csv"`
        }
      });
    }

    const payload = await loadOperationsChecklistPayload(supabase, actor, { shiftDate });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Operations Checklist.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Signed-in user record required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const result = await applyOperationsChecklistAction(supabase, actor, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Operations Checklist.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
