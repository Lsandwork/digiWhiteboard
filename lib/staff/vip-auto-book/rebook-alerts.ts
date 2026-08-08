type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getPublicSiteUrl } from "@/lib/site-url";
import { listVipAutoBookClients } from "@/lib/staff/vip-auto-book/store";
import {
  cadenceLabel,
  formatDaysOfWeek,
  serviceKindLabel,
  type VipAutoBookClient
} from "@/lib/staff/vip-auto-book/types";

const REBOOK_ALERT_DAYS = 14;
const REBOOK_SMS_TO = "2139131391";
const REBOOK_EMAIL_TO = ["contact@fitdog.com", "lonnie@fitdog.com"] as const;

function siteBase() {
  return getPublicSiteUrl().replace(/\/$/, "");
}

function vipLink() {
  return `${siteBase()}/admin?board=staff&tab=vip_auto_book`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildVipRebookDetailRows(client: VipAutoBookClient): Array<{ label: string; value: string }> {
  const days =
    client.daysBookedLabel ||
    (client.cadence === "monthly"
      ? client.monthlyWeek
        ? `Week ${client.monthlyWeek} of month`
        : "Monthly"
      : formatDaysOfWeek(client.daysOfWeek));

  const rows: Array<{ label: string; value: string }> = [
    { label: "Dog", value: client.dogName },
    { label: "Owner", value: client.ownerName },
    { label: "Service", value: client.serviceName || serviceKindLabel(client.serviceKind) },
    { label: "Cadence", value: cadenceLabel(client.cadence) },
    { label: "Days booked", value: days },
    { label: "Platform", value: client.platform || "APP" }
  ];
  if (client.lastBookedFor) rows.push({ label: "Last day booked", value: client.lastBookedFor });
  if (client.pickupLocation) rows.push({ label: "Pickup", value: client.pickupLocation });
  if (client.dropoffLocation) rows.push({ label: "Drop-off", value: client.dropoffLocation });
  if (client.preferredTime) rows.push({ label: "Preferred time", value: client.preferredTime });
  const notes = client.notes?.trim() || "";
  if (notes && !/^imported from/i.test(notes)) rows.push({ label: "Notes", value: notes });
  return rows;
}

export function buildVipRebookDetail(client: VipAutoBookClient) {
  return buildVipRebookDetailRows(client)
    .map((row) => `${row.label}: ${row.value}`)
    .join(" · ");
}

export function buildVipRebookEmailContent(client: VipAutoBookClient) {
  const rows = buildVipRebookDetailRows(client);
  const subject = `VIP Auto Book reminder: ${client.dogName} · ${client.ownerName}`;
  const text = [
    "VIP Auto Book reminder",
    "",
    "Please book this VIP client on Fitdog Sports / Digi-Board.",
    "",
    ...rows.map((row) => `${row.label}: ${row.value}`),
    "",
    `Open VIP Auto Book: ${vipLink()}`
  ].join("\n");

  const detailRowsHtml = rows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 12px 8px 0;color:#6b7280;font-size:13px;font-weight:600;vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;vertical-align:top;">${escapeHtml(row.value)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:20px 24px;background:#111827;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.75;">Fitdog Digi-Board</div>
        <div style="margin-top:6px;font-size:20px;font-weight:700;">VIP Auto Book reminder</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
          Please book this VIP client on Fitdog Sports / Digi-Board.
        </p>
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          ${detailRowsHtml}
        </table>
        <div style="margin-top:24px;">
          <a href="${vipLink()}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:700;font-size:14px;padding:12px 16px;border-radius:8px;">
            Open VIP Auto Book
          </a>
        </div>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

export function buildVipRebookSms(client: VipAutoBookClient) {
  return `Fitdog VIP: re-book ${client.dogName} (${client.ownerName}). Check RuffOps for details.`;
}

export function isVipRebookAlertDue(
  client: Pick<VipAutoBookClient, "needToRebook" | "needToRebookSetAt" | "rebookAlertSentAt">,
  now = new Date()
) {
  if (!client.needToRebook || !client.needToRebookSetAt) return false;
  if (client.rebookAlertSentAt) return false;
  const setAt = new Date(client.needToRebookSetAt).getTime();
  if (!Number.isFinite(setAt)) return false;
  const dueAt = setAt + REBOOK_ALERT_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() >= dueAt;
}

async function sendRebookEmails(client: VipAutoBookClient) {
  const email = getEmailProvider();
  if (!email.isConfigured()) {
    return { ok: false, error: "Email provider not configured (RESEND_API_KEY / RUFFLY_EMAIL_FROM)." };
  }
  const { subject, text, html } = buildVipRebookEmailContent(client);

  const results = [];
  for (const to of REBOOK_EMAIL_TO) {
    results.push(await email.send({ to, subject, html, text, purpose: "transactional" }));
  }
  const failed = results.find((row) => !row.ok);
  return failed ? { ok: false, error: failed.error || "Email send failed." } : { ok: true };
}

async function sendRebookSms(client: VipAutoBookClient) {
  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return { ok: false, error: "Twilio SMS not configured." };
  }
  return sms.send({
    to: REBOOK_SMS_TO,
    body: buildVipRebookSms(client),
    purpose: "transactional",
    idempotencyKey: `vip-rebook:${client.id}:${client.needToRebookSetAt || "x"}`.slice(0, 64)
  });
}

/** Fire Medium in-app alert + email + SMS for one VIP client. */
export async function sendVipRebookAlert(supabase: SupabaseClient, client: VipAutoBookClient) {
  const detail = buildVipRebookDetail(client);
  const title = `VIP re-book reminder · ${client.dogName}`;
  const body = `${client.ownerName} · ${detail}`;

  await dispatchStaffOpsNotificationEvent(supabase, {
    eventType: "created",
    sourceTable: "vip_auto_book_clients",
    sourceId: client.id,
    sourceTab: "vip_auto_book",
    title,
    body,
    priority: "Medium",
    needsManagementReview: true,
    notifyFrontDeskCoordinators: true,
    toDepartment: "Front Desk",
    actor: "VIP Auto Book"
  });

  const [emailResult, smsResult] = await Promise.all([sendRebookEmails(client), sendRebookSms(client)]);

  const { error } = await supabase
    .from("vip_auto_book_clients")
    .update({ rebook_alert_sent_at: new Date().toISOString() })
    .eq("id", client.id);
  if (error) throw new Error(error.message);

  return {
    ok: true,
    emailOk: emailResult.ok,
    smsOk: Boolean(smsResult.ok),
    emailError: emailResult.ok ? undefined : emailResult.error,
    smsError: smsResult.ok ? undefined : smsResult.error
  };
}

/** Cron: send alerts for VIP rows that have been Need to Re-Book = Yes for 14+ days. */
export async function processVipRebookAlerts(supabase: SupabaseClient) {
  const listed = await listVipAutoBookClients(supabase, { status: "all", pageSize: 100 });
  const needing = listed.rows.filter((row) => row.needToRebook);
  const due = needing.filter((client) => isVipRebookAlertDue(client));

  const results: Array<{ id: string; dogName: string; ok: boolean; error?: string }> = [];
  for (const client of due) {
    try {
      const sent = await sendVipRebookAlert(supabase, client);
      results.push({
        id: client.id,
        dogName: client.dogName,
        ok: true,
        error: [sent.emailError, sent.smsError].filter(Boolean).join(" | ") || undefined
      });
    } catch (err) {
      results.push({
        id: client.id,
        dogName: client.dogName,
        ok: false,
        error: err instanceof Error ? err.message : "Alert failed"
      });
    }
  }

  return { checked: needing.length, due: due.length, results };
}
