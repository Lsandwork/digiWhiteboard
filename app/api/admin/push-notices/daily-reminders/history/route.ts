import { NextResponse } from "next/server";
import { canViewDailyReminderHistory, isAdminRequest, unauthorizedAdminResponse, getEffectiveAdminRole } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getDailyReminderHistory } from "@/lib/staff/daily-reminders";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);
  if (!canViewDailyReminderHistory(role)) {
    return NextResponse.json({ error: "You do not have permission to view Daily Reminder history." }, { status: 403 });
  }

  const url = new URL(request.url);
  const reminderId = url.searchParams.get("reminder_id") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 100);

  try {
    const supabase = getServiceSupabase();
    const history = await getDailyReminderHistory(supabase, {
      reminderId,
      limit: Number.isFinite(limit) ? limit : 100
    });
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Daily Reminder history.";
    return NextResponse.json({ error: message, history: [] }, { status: 500 });
  }
}
