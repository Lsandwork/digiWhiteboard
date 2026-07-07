import { NextResponse } from "next/server";
import { canEditDailyReminders, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { updateDailyReminder } from "@/lib/staff/daily-reminders";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canEditDailyReminders(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to edit Daily Reminders." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const reminder = await updateDailyReminder(supabase, id, body);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.daily_reminder.update",
      targetType: "daily_reminder",
      targetId: reminder.id,
      details: { title: reminder.title }
    });
    return NextResponse.json({ reminder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Daily Reminder.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
