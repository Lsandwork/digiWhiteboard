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

export function buildVipRebookDetail(client: VipAutoBookClient) {
  const days =
    client.daysBookedLabel ||
    (client.cadence === "monthly"
      ? client.monthlyWeek
        ? `Week ${client.monthlyWeek} of month`
        : "Monthly"
      : formatDaysOfWeek(client.daysOfWeek));
  return [
    `Dog: ${client.dogName}`,
    `Owner: ${client.ownerName}`,
    `Service: ${client.serviceName || serviceKindLabel(client.serviceKind)}`,
    `Cadence: ${cadenceLabel(client.cadence)}`,
    `Days booked: ${days}`,
    `Platform: ${client.platform || "APP"}`,
    client.lastBookedFor ? `Last day booked: ${client.lastBookedFor}` : null,
    client.pickupLocation ? `Pickup: ${client.pickupLocation}` : null,
    client.dropoffLocation ? `Drop-off: ${client.dropoffLocation}` : null,
    client.preferredTime ? `Preferred time: ${client.preferredTime}` : null,
    client.notes ? `Notes: ${client.notes}` : null
  ]
    .filter(Boolean)
    .join(" · ");
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

async function sendRebookEmails(client: VipAutoBookClient, detail: string) {
  const email = getEmailProvider();
  if (!email.isConfigured()) {
    return { ok: false, error: "Email provider not configured (RESEND_API_KEY / RUFFLY_EMAIL_FROM)." };
  }
  const subject = `VIP Auto Book reminder: ${client.dogName} · ${client.ownerName}`;
  const text = [
    "Reminder: book this VIP Auto Book client on Fitdog Sports / Digi-Board.",
    "",
    detail,
    "",
    `Open VIP Auto Book: ${vipLink()}`
  ].join("\n");
  const html = `<p><strong>Reminder:</strong> book this VIP Auto Book client.</p><p>${detail
    .split(" · ")
    .map((part) => part.replace(/</g, "&lt;"))
    .join("<br/>")}</p><p><a href="${vipLink()}">Open VIP Auto Book in RuffOps</a></p>`;

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

  const [emailResult, smsResult] = await Promise.all([sendRebookEmails(client, detail), sendRebookSms(client)]);

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
