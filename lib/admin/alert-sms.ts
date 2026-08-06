import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminUserAccessAssignments } from "@/lib/admin/user-access";
import { isAdminOrManagementRole, type AdminUserRole } from "@/lib/admin/users";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { phoneDigitsE164 } from "@/lib/route-generator/stop-notes";
import type { StaffOpsPriority } from "@/lib/staff/admin-ops";
import type { StaffOpsNotificationEvent } from "@/lib/staff/notifications";

/** RBAC roles that receive critical/urgent alert SMS (includes Super Admin). */
const ALERT_SMS_ROLES = new Set(["super_admin", "admin", "management"]);

/** Legacy + RBAC roles for Super Admin / Admin / Management alert recipients. */
export function isCriticalAlertSmsRole(role?: string | null, accessRoles?: string[] | null) {
  if (isAdminOrManagementRole(role)) return true;
  if (role === "owner_admin") return true;
  return (accessRoles ?? []).some((value) => ALERT_SMS_ROLES.has(value));
}

export type CriticalAlertSmsInput = {
  title: string;
  body?: string | null;
  priority?: StaffOpsPriority | string | null;
  urgent?: boolean;
  displayMode?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
};

/** Critical / Urgent priorities, or explicit urgent flag — not mere High. */
export function shouldSendCriticalAlertSms(input: {
  priority?: string | null;
  urgent?: boolean;
  displayMode?: string | null;
}) {
  if (input.urgent === true) return true;
  const priority = String(input.priority ?? "")
    .trim()
    .toLowerCase();
  if (priority === "critical" || priority === "urgent") return true;
  const displayMode = String(input.displayMode ?? "")
    .trim()
    .toLowerCase();
  return displayMode === "urgent";
}

export function formatAlertSmsBody(title: string, body?: string | null) {
  const cleanTitle = title.trim() || "Fitdog alert";
  const cleanBody = String(body ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const combined = cleanBody ? `Fitdog ALERT: ${cleanTitle} — ${cleanBody}` : `Fitdog ALERT: ${cleanTitle}`;
  return combined.slice(0, 320);
}

function userReceivesAlertSms(role: string | null | undefined, accessRoles: string[] | undefined) {
  return isCriticalAlertSmsRole(role, accessRoles);
}

export async function listCriticalAlertSmsRecipients(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status, phone")
    .eq("status", "active")
    .not("phone", "is", null);

  if (error) {
    // Column may not exist until migration 054 is applied.
    if (error.message?.includes("phone") || error.code === "42703") return [];
    throw error;
  }

  let accessState: Awaited<ReturnType<typeof loadAdminUserAccessAssignments>> = { assignments: {} };
  try {
    accessState = await loadAdminUserAccessAssignments(supabase);
  } catch {
    accessState = { assignments: {} };
  }

  const phones = new Map<string, { userId: string; name: string; phone: string }>();
  for (const row of data ?? []) {
    const assignment = accessState.assignments?.[row.id];
    const accessRoles = assignment
      ? [...new Set([assignment.primaryRole, ...(assignment.roles ?? [])].filter(Boolean) as string[])]
      : undefined;
    if (!userReceivesAlertSms(row.role as AdminUserRole, accessRoles)) continue;
    const phone = phoneDigitsE164(row.phone);
    if (!phone) continue;
    if (!phones.has(phone)) {
      phones.set(phone, {
        userId: row.id,
        name: row.full_name || row.email,
        phone
      });
    }
  }
  return [...phones.values()];
}

async function alreadySent(supabase: SupabaseClient, key: string) {
  const { data, error } = await supabase
    .from("admin_alert_sms_log")
    .select("idempotency_key")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    return false;
  }
  return Boolean(data);
}

async function recordSent(
  supabase: SupabaseClient,
  key: string,
  recipientCount: number,
  sourceTable?: string | null,
  sourceId?: string | null
) {
  await supabase.from("admin_alert_sms_log").upsert(
    {
      idempotency_key: key,
      recipient_count: recipientCount,
      source_table: sourceTable ?? null,
      source_id: sourceId ?? null,
      created_at: new Date().toISOString()
    },
    { onConflict: "idempotency_key" }
  );
}

export async function sendCriticalAlertSmsToAdmins(
  supabase: SupabaseClient,
  input: CriticalAlertSmsInput
): Promise<{ sent: number; skipped: string | null }> {
  if (!shouldSendCriticalAlertSms(input)) {
    return { sent: 0, skipped: "not_critical_or_urgent" };
  }

  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return { sent: 0, skipped: "twilio_not_configured" };
  }

  const key =
    input.idempotencyKey?.trim() ||
    `critical-sms:${input.sourceTable ?? "alert"}:${input.sourceId ?? input.title}:${input.priority ?? ""}:${input.urgent ? "u" : "n"}`;

  if (await alreadySent(supabase, key)) {
    return { sent: 0, skipped: "duplicate" };
  }

  const recipients = await listCriticalAlertSmsRecipients(supabase);
  if (!recipients.length) {
    await recordSent(supabase, key, 0, input.sourceTable, input.sourceId).catch(() => undefined);
    return { sent: 0, skipped: "no_recipients" };
  }

  const body = formatAlertSmsBody(input.title, input.body);
  let sent = 0;
  for (const recipient of recipients) {
    const result = await sms.send({
      to: recipient.phone,
      body,
      purpose: "transactional",
      idempotencyKey: `${key}:${recipient.phone}`
    });
    if (result.ok) sent += 1;
  }

  await recordSent(supabase, key, sent, input.sourceTable, input.sourceId).catch(() => undefined);
  return { sent, skipped: sent ? null : "send_failed" };
}

export async function maybeSmsStaffOpsCriticalAlert(
  supabase: SupabaseClient,
  event: StaffOpsNotificationEvent
) {
  if (!shouldSendCriticalAlertSms(event)) {
    return { sent: 0, skipped: "not_critical_or_urgent" };
  }
  try {
    return await sendCriticalAlertSmsToAdmins(supabase, {
      title: event.title,
      body: event.body,
      priority: event.priority,
      urgent: event.urgent,
      sourceTable: event.sourceTable,
      sourceId: event.sourceId,
      idempotencyKey: `staff-ops:${event.sourceTable}:${event.sourceId}:${event.eventType}:${event.priority}:${event.urgent ? "1" : "0"}`
    });
  } catch {
    return { sent: 0, skipped: "error" };
  }
}
