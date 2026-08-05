import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminSettings } from "@/lib/admin/settings";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import type { StaffOpsPriority } from "@/lib/staff/admin-ops";
import type { StaffOpsNotificationEvent } from "@/lib/staff/notifications";

/** Canonical Super Admin inbox for Critical/Urgent alert emails. */
export const CRITICAL_ALERT_SUPER_ADMIN_EMAIL = "lonnie@fitdog.com";

export type CriticalAlertEmailInput = {
  title: string;
  body?: string | null;
  priority?: StaffOpsPriority | string | null;
  urgent?: boolean;
  displayMode?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  sourceTab?: string | null;
  idempotencyKey?: string | null;
};

/** Critical / Urgent priorities, or explicit urgent flag — not mere High. */
export function shouldSendCriticalAlertEmail(input: {
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

export function normalizeAlertEmail(value?: string | null) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

/** Always includes Super Admin (lonnie@fitdog.com); adds settings admin_alert_email when set. */
export function buildCriticalAlertEmailRecipients(adminAlertEmail?: string | null) {
  const recipients = new Set<string>();
  recipients.add(CRITICAL_ALERT_SUPER_ADMIN_EMAIL);
  const extra = normalizeAlertEmail(adminAlertEmail);
  if (extra) recipients.add(extra);
  return [...recipients];
}

export function formatAlertEmailSubject(title: string, priority?: string | null) {
  const label = String(priority ?? "Critical").trim() || "Critical";
  const cleanTitle = title.trim() || "Fitdog alert";
  return `[Fitdog ${label}] ${cleanTitle}`.slice(0, 200);
}

export function formatAlertEmailText(input: {
  title: string;
  body?: string | null;
  priority?: string | null;
  sourceTab?: string | null;
  dashboardUrl?: string | null;
}) {
  const lines = [
    "Fitdog critical / urgent alert",
    "",
    `Title: ${input.title.trim() || "Fitdog alert"}`,
    `Priority: ${String(input.priority ?? "Critical").trim() || "Critical"}`,
    input.body?.trim() ? `Details: ${input.body.trim()}` : null,
    input.sourceTab ? `Source: ${input.sourceTab}` : null,
    input.dashboardUrl ? `Open dashboard: ${input.dashboardUrl}` : null,
    "",
    "This email was sent to the Super Admin for immediate attention."
  ].filter((line) => line !== null);
  return lines.join("\n");
}

export function formatAlertEmailHtml(input: {
  title: string;
  body?: string | null;
  priority?: string | null;
  sourceTab?: string | null;
  dashboardUrl?: string | null;
}) {
  const title = escapeHtml(input.title.trim() || "Fitdog alert");
  const priority = escapeHtml(String(input.priority ?? "Critical").trim() || "Critical");
  const body = input.body?.trim() ? escapeHtml(input.body.trim()) : null;
  const sourceTab = input.sourceTab ? escapeHtml(input.sourceTab) : null;
  const dashboardUrl = input.dashboardUrl?.trim() || null;

  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
    <h2 style="margin: 0 0 12px;">Fitdog critical / urgent alert</h2>
    <p style="margin: 0 0 8px;"><strong>Title:</strong> ${title}</p>
    <p style="margin: 0 0 8px;"><strong>Priority:</strong> ${priority}</p>
    ${body ? `<p style="margin: 0 0 8px;"><strong>Details:</strong> ${body}</p>` : ""}
    ${sourceTab ? `<p style="margin: 0 0 8px;"><strong>Source:</strong> ${sourceTab}</p>` : ""}
    ${
      dashboardUrl
        ? `<p style="margin: 16px 0;"><a href="${escapeHtml(dashboardUrl)}" style="background:#0f766e;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;">Open dashboard</a></p>`
        : ""
    }
    <p style="margin: 16px 0 0; color: #555; font-size: 13px;">Sent to Super Admin for immediate attention.</p>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dashboardUrlForTab(sourceTab?: string | null) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(/\/$/, "");
  if (!sourceTab) return `${base}/admin`;
  return `${base}/admin?tab=${encodeURIComponent(sourceTab)}`;
}

async function alreadySent(supabase: SupabaseClient, key: string) {
  const { data, error } = await supabase
    .from("admin_alert_email_log")
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
  recipients: string[],
  sourceTable?: string | null,
  sourceId?: string | null
) {
  await supabase.from("admin_alert_email_log").upsert(
    {
      idempotency_key: key,
      recipient_count: recipientCount,
      recipients,
      source_table: sourceTable ?? null,
      source_id: sourceId ?? null,
      created_at: new Date().toISOString()
    },
    { onConflict: "idempotency_key" }
  );
}

export async function listCriticalAlertEmailRecipients(supabase: SupabaseClient) {
  let adminAlertEmail: string | null = null;
  try {
    const settings = await loadAdminSettings(supabase);
    adminAlertEmail = settings.admin_alert_email || null;
  } catch {
    adminAlertEmail = null;
  }
  return buildCriticalAlertEmailRecipients(adminAlertEmail);
}

export async function sendCriticalAlertEmailToSuperAdmin(
  supabase: SupabaseClient,
  input: CriticalAlertEmailInput
): Promise<{ sent: number; skipped: string | null; recipients: string[] }> {
  if (!shouldSendCriticalAlertEmail(input)) {
    return { sent: 0, skipped: "not_critical_or_urgent", recipients: [] };
  }

  const email = getEmailProvider();
  if (!email.isConfigured()) {
    return { sent: 0, skipped: "resend_not_configured", recipients: [] };
  }

  const key =
    input.idempotencyKey?.trim() ||
    `critical-email:${input.sourceTable ?? "alert"}:${input.sourceId ?? input.title}:${input.priority ?? ""}:${input.urgent ? "u" : "n"}`;

  if (await alreadySent(supabase, key)) {
    return { sent: 0, skipped: "duplicate", recipients: [] };
  }

  const recipients = await listCriticalAlertEmailRecipients(supabase);
  if (!recipients.length) {
    await recordSent(supabase, key, 0, [], input.sourceTable, input.sourceId).catch(() => undefined);
    return { sent: 0, skipped: "no_recipients", recipients: [] };
  }

  const dashboardUrl = dashboardUrlForTab(input.sourceTab);
  const subject = formatAlertEmailSubject(input.title, input.priority);
  const text = formatAlertEmailText({
    title: input.title,
    body: input.body,
    priority: input.priority,
    sourceTab: input.sourceTab,
    dashboardUrl
  });
  const html = formatAlertEmailHtml({
    title: input.title,
    body: input.body,
    priority: input.priority,
    sourceTab: input.sourceTab,
    dashboardUrl
  });

  let sent = 0;
  for (const to of recipients) {
    const result = await email.send({
      to,
      subject,
      html,
      text,
      purpose: "transactional"
    });
    if (result.ok) sent += 1;
  }

  await recordSent(supabase, key, sent, recipients, input.sourceTable, input.sourceId).catch(() => undefined);
  return { sent, skipped: sent ? null : "send_failed", recipients };
}

export async function maybeEmailStaffOpsCriticalAlert(
  supabase: SupabaseClient,
  event: StaffOpsNotificationEvent
) {
  if (!shouldSendCriticalAlertEmail(event)) {
    return { sent: 0, skipped: "not_critical_or_urgent", recipients: [] as string[] };
  }
  try {
    return await sendCriticalAlertEmailToSuperAdmin(supabase, {
      title: event.title,
      body: event.body,
      priority: event.priority,
      urgent: event.urgent,
      sourceTable: event.sourceTable,
      sourceId: event.sourceId,
      sourceTab: event.sourceTab,
      idempotencyKey: `staff-ops-email:${event.sourceTable}:${event.sourceId}:${event.eventType}:${event.priority}:${event.urgent ? "1" : "0"}`
    });
  } catch {
    return { sent: 0, skipped: "error", recipients: [] as string[] };
  }
}
