import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { listHandlerDailyChecklistItems } from "@/lib/staff/handler-checklist-daily";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ChecklistItemState = {
  checked: boolean;
  timestamp: string;
};

type ChecklistState = Record<string, ChecklistItemState>;

function normalizeChecklistState(value: unknown): ChecklistState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: ChecklistState = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (raw && typeof raw === "object" && "checked" in raw && "timestamp" in raw) {
      next[key] = {
        checked: Boolean((raw as ChecklistItemState).checked),
        timestamp: String((raw as ChecklistItemState).timestamp ?? new Date().toISOString())
      };
      continue;
    }
    next[key] = {
      checked: Boolean(raw),
      timestamp: new Date().toISOString()
    };
  }
  return next;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const adminUserId = normalizeAdminUserId(session?.adminUserId);
  if (!adminUserId) {
    return NextResponse.json({ error: "Signed-in user record required." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const [{ data, error }, daily] = await Promise.all([
      supabase.from("admin_users").select("handler_checklist_state").eq("id", adminUserId).maybeSingle(),
      listHandlerDailyChecklistItems(supabase)
    ]);

    if (error) throw error;

    return NextResponse.json({
      checklist_state: normalizeChecklistState(data?.handler_checklist_state),
      daily_items: daily.items,
      shift_date: daily.shiftDate,
      time_zone: daily.timeZone
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load handler checklist.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const adminUserId = normalizeAdminUserId(session?.adminUserId);
  if (!adminUserId) {
    return NextResponse.json({ error: "Signed-in user record required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const checklistState = normalizeChecklistState(body.checklist_state);

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("admin_users")
      .update({ handler_checklist_state: checklistState })
      .eq("id", adminUserId);

    if (error) throw error;

    return NextResponse.json({ ok: true, checklist_state: checklistState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save handler checklist.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
