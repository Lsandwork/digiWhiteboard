import { getEmailProvider } from "@/lib/integrations/email/provider";
import { getPublicSiteUrl } from "@/lib/site-url";
import type { TlBoardAdditionalServiceRow } from "./types";

export const TL_SERVICES_EMAIL_TO = "contact@fitdog.com";
export const TL_SERVICES_EMAIL_TIMEZONE = "America/Los_Angeles";

/** 6:30am, 9:30am, 12:30pm, 3:30pm, 6:30pm Pacific — daily through 7pm cutoff. */
export const TL_SERVICES_EMAIL_HOURS = [6, 9, 12, 15, 18] as const;
export const TL_SERVICES_EMAIL_MINUTE = 30;

export type LaClockParts = {
  hour: number;
  minute: number;
  dateKey: string;
};

export function laClockParts(now = new Date()): LaClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TL_SERVICES_EMAIL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return {
    hour: read("hour") === 24 ? 0 : read("hour"),
    minute: read("minute"),
    dateKey: `${year}-${month}-${day}`
  };
}

/** True during 6:30am–7:00pm Pacific daily window. */
export function isTlServicesEmailWindow(now = new Date()): boolean {
  const { hour, minute } = laClockParts(now);
  if (hour < 6 || hour > 19) return false;
  if (hour === 6 && minute < TL_SERVICES_EMAIL_MINUTE) return false;
  if (hour === 19 && minute > 0) return false;
  return true;
}

/** True on the :30 marks at 6, 9, 12, 15, 18 Pacific (every 3 hours from 6:30am). */
export function isTlServicesEmailSendSlot(now = new Date()): boolean {
  if (!isTlServicesEmailWindow(now)) return false;
  const { hour, minute } = laClockParts(now);
  if (minute !== TL_SERVICES_EMAIL_MINUTE) return false;
  return (TL_SERVICES_EMAIL_HOURS as readonly number[]).includes(hour);
}

export function tlServicesEmailSlotKey(now = new Date()): string | null {
  if (!isTlServicesEmailSendSlot(now)) return null;
  const { hour, dateKey } = laClockParts(now);
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(TL_SERVICES_EMAIL_MINUTE).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTlServicesReminderEmail(services: TlBoardAdditionalServiceRow[]) {
  const boardUrl = `${getPublicSiteUrl().replace(/\/$/, "")}/boards/tl-alerts-reminders`;
  const subject = `TL Digi Board · ${services.length} additional service${services.length === 1 ? "" : "s"} still need completion in Gingr`;

  const lines = services.map(
    (row) =>
      `• ${row.dogName} — ${row.serviceName}${row.lodgingLabel ? ` (${row.lodgingLabel})` : ""}${
        row.scheduledAt ? ` · scheduled ${row.scheduledAt}` : ""
      }`
  );

  const text = [
    "Team Lead Additional Services reminder",
    "",
    `${services.length} service${services.length === 1 ? "" : "s"} still need completion in Gingr:`,
    "",
    ...lines,
    "",
    `Open TL Digi Board: ${boardUrl}`
  ].join("\n");

  const rowsHtml = services
    .map(
      (row) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.dogName)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.serviceName)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.lodgingLabel || "—")}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#111827;">
    <h2 style="margin:0 0 12px;">Team Lead Additional Services reminder</h2>
    <p style="margin:0 0 16px;">${services.length} service${services.length === 1 ? "" : "s"} still need completion in Gingr.</p>
    <table style="border-collapse:collapse;width:100%;max-width:720px;">
      <thead><tr style="background:#f3f4f6;text-align:left;">
        <th style="padding:8px 12px;">Dog</th><th style="padding:8px 12px;">Service</th><th style="padding:8px 12px;">Lodging</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin:20px 0 0;"><a href="${boardUrl}">Open TL Digi Board</a></p>
  </body></html>`;

  return { subject, text, html };
}

export async function sendTlServicesReminderEmail(services: TlBoardAdditionalServiceRow[]) {
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    return { ok: false as const, error: "email_provider_not_configured" };
  }
  const content = buildTlServicesReminderEmail(services);
  const result = await provider.send({
    to: TL_SERVICES_EMAIL_TO,
    subject: content.subject,
    html: content.html,
    text: content.text,
    purpose: "transactional"
  });
  return result.ok
    ? { ok: true as const, providerMessageId: result.providerMessageId }
    : { ok: false as const, error: result.error || "email_send_failed" };
}

export const TL_SERVICES_EMAIL_STATE_KEY = "tl_digi_board_services_email_state";

export type TlServicesEmailState = {
  lastSlotKey: string | null;
  lastSentAt: string | null;
  lastServiceCount: number;
};

export function parseTlServicesEmailState(value: unknown): TlServicesEmailState {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    lastSlotKey: typeof row.lastSlotKey === "string" ? row.lastSlotKey : null,
    lastSentAt: typeof row.lastSentAt === "string" ? row.lastSentAt : null,
    lastServiceCount: Number(row.lastServiceCount ?? 0) || 0
  };
}
