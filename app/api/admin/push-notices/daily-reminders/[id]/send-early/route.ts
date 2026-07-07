import { NextResponse } from "next/server";
import {
  canForceResendDailyReminder,
  canSendDailyReminderEarly,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { loadAdminSettings } from "@/lib/admin/settings";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import {
  deliverDailyReminderPush,
  getShiftDate,
  listDailyRemindersWithState,
  rowToReminder,
  sendDailyReminderEarly
} from "@/lib/staff/daily-reminders";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canSendDailyReminderEarly(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to send Daily Reminders early." }, { status: 403 });
  }

  const { id } = await context.params;
  const actor = {
    userId: session?.adminUserId ?? null,
    name: session?.email ?? session?.adminUserId ?? "staff"
  };

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const supabase = getServiceSupabase();

    let result;
    if (body.force) {
      if (!canForceResendDailyReminder(session?.role)) {
        return NextResponse.json({ error: "Only admins can force resend a Daily Reminder." }, { status: 403 });
      }
      const settings = await loadAdminSettings(supabase);
      const shiftDate = getShiftDate(settings.timezone);
      const { data, error } = await supabase.from("daily_reminders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Daily reminder not found." }, { status: 404 });
      result = await deliverDailyReminderPush(supabase, rowToReminder(data as Record<string, unknown>), {
        sentType: "force_resend",
        shiftDate,
        actor,
        allowForce: true,
        queueWhenBlocked: false
      });
      if (!result.delivered) {
        return NextResponse.json({ error: "Unable to force resend this reminder." }, { status: 409 });
      }
    } else {
      result = await sendDailyReminderEarly(supabase, id, actor);
    }

    const table = await listDailyRemindersWithState(supabase, {
      canForceResend: canForceResendDailyReminder(session?.role)
    });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: body.force ? "staff.daily_reminder.force_resend" : "staff.daily_reminder.send_early",
      targetType: "daily_reminder",
      targetId: id,
      details: { push_notice_id: result.notice?.id ?? null }
    });

    return NextResponse.json({
      ok: true,
      notice: result.notice,
      message: body.force
        ? "Reminder force-sent to the Staff Digital Whiteboard."
        : "Reminder sent early and will be skipped at its scheduled time today.",
      ...table
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send Daily Reminder early.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
