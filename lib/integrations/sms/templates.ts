import { sanitizeSmsBody } from "@/lib/integrations/sms/estimate-segments";

export type RouteTrackingLinkInput = {
  dogs: string;
  direction: "pickup" | "drop-off";
  url: string;
};

export type RouteEtaInput = {
  dogs: string;
  etaMinutes: number;
  url: string;
};

export type RoutePullupInput = {
  dogs: string;
  url: string;
};

/** Live tracking link SMS — GSM-safe, targets one segment with realistic URL length. */
export function buildRouteTrackingLinkSms(input: RouteTrackingLinkInput): string {
  return sanitizeSmsBody(`Fitdog: track ${input.dogs}'s ${input.direction} live - ${input.url}`);
}

/** 30-minute ETA alert — GSM-safe. */
export function buildRouteEta30Sms(input: RouteEtaInput): string {
  return sanitizeSmsBody(
    `Fitdog: driver about ${input.etaMinutes} min away for ${input.dogs}. Track: ${input.url}`
  );
}

/** 15-minute ETA alert — GSM-safe (no tilde). */
export function buildRouteEta15Sms(input: RouteEtaInput): string {
  return sanitizeSmsBody(
    `Fitdog: driver about ${input.etaMinutes} min out for ${input.dogs}. Map: ${input.url}`
  );
}

/** Pull-up alert — omits full street address; map link carries location. */
export function buildRoutePullupSms(input: RoutePullupInput): string {
  return sanitizeSmsBody(`Fitdog: driver pulling up for ${input.dogs} now. ${input.url}`);
}

export type AdminSmsInput = {
  title: string;
  detail?: string | null;
  adminPath?: string;
  /** Critical alerts may include a short link when safety requires it. */
  includeLink?: boolean;
  siteBase: string;
};

function truncate(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function adminCta(adminPath?: string): string {
  const path = adminPath || "/admin?board=staff";
  if (path.includes("write_up")) return "Open RuffOps > People & HR.";
  if (path.includes("emergency")) return "Open RuffOps > Emergency Alerts.";
  if (path.includes("front_desk") || path.includes("team_log")) return "Open RuffOps > Team Log.";
  if (path.includes("active_issue")) return "Open RuffOps > Active Issues.";
  if (path.includes("follow_up")) return "Open RuffOps > Owner Follow Up.";
  if (path.includes("vip_auto_book")) return "Open RuffOps > VIP Auto Book.";
  return "Open RuffOps.";
}

/** GSM-safe Super Admin / ops alert body. Routine alerts omit long URLs. */
export function buildAdminAlertSms(input: AdminSmsInput): string {
  const title = truncate(sanitizeSmsBody(input.title), 90);
  const detail = input.detail ? truncate(sanitizeSmsBody(input.detail), 100) : null;
  const cta = adminCta(input.adminPath);
  const parts = [`Fitdog Alert: ${title}`];
  if (detail) parts.push(detail);
  parts.push(cta);
  if (input.includeLink) {
    const link = `${input.siteBase.replace(/\/$/, "")}${input.adminPath || "/admin?board=staff"}`;
    parts.push(link);
  }
  return truncate(parts.join(" | "), 320);
}

/** Demo / test realistic route SMS inputs. */
export const ROUTE_SMS_FIXTURE = {
  dogs: "Atlas + Luna",
  direction: "pickup" as const,
  etaMinutes: 14,
  url: "https://fitdog.ruffops.com/track/aB3dEf9GhIjKlMnOpQrStu"
};
