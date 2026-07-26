import { NextResponse } from "next/server";
import {
  canEditDailyReminders,
  canForceResendDailyReminder,
  canSendDailyReminderEarly,
  isAdminRequest,
  unauthorizedAdminResponse,
  getEffectiveAdminRole
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { listDailyRemindersWithState, setSwingHandlerPresent } from "@/lib/staff/daily-reminders";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to view Daily Reminders." }, { status: 403 });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);
  if (!canSendDailyReminderEarly(role)) return forbiddenResponse();

  try {
    const supabase = getServiceSupabase();
    const payload = await listDailyRemindersWithState(supabase, {
      canForceResend: canForceResendDailyReminder(role)
    });
    return NextResponse.json({
      ...payload,
      permissions: {
        canEdit: canEditDailyReminders(role),
        canSendEarly: canSendDailyReminderEarly(role),
        canForceResend: canForceResendDailyReminder(role)
      },
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Daily Reminders.";
    return NextResponse.json({ error: message, reminders: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);
  if (!canEditDailyReminders(role)) {
    return NextResponse.json({ error: "You do not have permission to update swing handler status." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { swing_handler_present?: unknown };
    const supabase = getServiceSupabase();
    const swingHandlerPresent = await setSwingHandlerPresent(supabase, Boolean(body.swing_handler_present));
    const payload = await listDailyRemindersWithState(supabase, {
      canForceResend: canForceResendDailyReminder(role)
    });
    return NextResponse.json({ ...payload, swingHandlerPresent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update swing handler status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
