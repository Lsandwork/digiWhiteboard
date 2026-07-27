/**
 * Fitdog notification / activity-stream parsers for Operations Alerts.
 */
import type { FitdogAlertType } from "@/lib/fitdog-ops/types";

export type FitdogNotificationItem = {
  id: string;
  text: string;
  detected_at?: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown>;
};

export type ParsedFitdogNotification = {
  id: string;
  text: string;
  alert_type: FitdogAlertType;
  owner_name: string;
  dog_name: string | null;
  service_name: string | null;
  service_date: string | null;
  failure_reason: string;
  detected_at: string | null;
  source_url: string | null;
  raw?: Record<string, unknown>;
  transaction_id?: string | null;
};

const CARD_DECLINED_CANCEL =
  /cancelled due to their (?:credit )?card being declined|credit card being declined|card (?:was )?declined/i;

const PAYMENT_ERROR =
  /PAYMENT\s*ERROR|needs to update credit card|Failed to charge amount|has already been captured/i;

function parseUsDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !day || !year) return null;
  const iso = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
}

function notificationId(text: string, detectedAt?: string | null): string {
  const basis = `${text.trim().toLowerCase()}|${detectedAt || ""}`;
  return `notif-${Buffer.from(basis).toString("base64url").slice(0, 40)}`;
}

export function isCardDeclinedCancellation(text: string): boolean {
  return CARD_DECLINED_CANCEL.test(text) && /cancel/i.test(text);
}

export function isPaymentErrorNotification(text: string): boolean {
  return PAYMENT_ERROR.test(text);
}

const DECLINED_ONLY = /declin/i;

export function classifyFitdogNotificationText(text: string): FitdogAlertType {
  if (isPaymentErrorNotification(text)) return "PAYMENT_ERROR";
  if (isCardDeclinedCancellation(text) || (DECLINED_ONLY.test(text) && /cancel|class|payment/i.test(text))) {
    return "CARD_DECLINED";
  }
  return "FITDOG_NOTIFICATION";
}

export function parseFitdogNotification(item: FitdogNotificationItem): ParsedFitdogNotification {
  const text = String(item.text || "").replace(/\s+/g, " ").trim();
  const detected_at = item.detected_at || null;
  const source_url = item.source_url || "https://app.fitdog.com/dashboard";
  const id = item.id?.trim() || notificationId(text, detected_at);
  const alert_type = classifyFitdogNotificationText(text);

  // PAYMENT ERROR — Lisa Miller needs to update credit card... class "Cool Tricks" on 07/27/2026 for dog Lila
  // Charge ch_... has already been captured.
  const paymentErrorOwner = text.match(
    /(?:^|\b)PAYMENT\s*ERROR\s+(.+?)\s+needs to update credit card/i
  );
  const paymentErrorOrders = text.match(
    /class\s+[«»"“”]?([^«»"“”]+?)[«»"“”]?\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+for dog\s+([A-Za-z0-9'’ .\-]+?)(?=\.|\s+Charge\b|$)/i
  );
  const paymentErrorCharge = text.match(/\bCharge\s+(ch_[A-Za-z0-9]+)/i);
  if (isPaymentErrorNotification(text) && (paymentErrorOwner || paymentErrorOrders || /Failed to charge/i.test(text))) {
    const ownerFromNeedsUpdate = text.match(/^(.+?)\s+needs to update credit card/i);
    return {
      id,
      text,
      alert_type: "PAYMENT_ERROR",
      owner_name: (paymentErrorOwner?.[1] || ownerFromNeedsUpdate?.[1] || "Owner").trim(),
      service_name: paymentErrorOrders?.[1]?.trim() || null,
      service_date: paymentErrorOrders?.[2] ? parseUsDate(paymentErrorOrders[2]) : null,
      dog_name: paymentErrorOrders?.[3]?.trim() || null,
      failure_reason: text,
      detected_at,
      source_url,
      transaction_id: paymentErrorCharge?.[1] || null,
      raw: item.raw
    };
  }

  // "Lucia Atwood class, Reliable Recall, on 07/24/2026 Jake was cancelled due to their credit card being declined..."
  const declinedClass = text.match(
    /^(.+?)\s+class,\s*(.+?),\s*on\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+was cancelled due to their (?:credit )?card being declined/i
  );
  if (declinedClass) {
    return {
      id,
      text,
      alert_type: "CARD_DECLINED",
      owner_name: declinedClass[1].trim(),
      service_name: declinedClass[2].trim(),
      service_date: parseUsDate(declinedClass[3]),
      dog_name: declinedClass[4].trim(),
      failure_reason: text,
      detected_at,
      source_url,
      raw: item.raw
    };
  }

  // "Scout cancelled their Trail Foundations for 07/24/2026."
  const simpleCancel = text.match(/^(.+?)\s+cancelled their\s+(.+?)\s+for\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (simpleCancel) {
    return {
      id,
      text,
      alert_type,
      owner_name: "Owner",
      dog_name: simpleCancel[1].trim(),
      service_name: simpleCancel[2].trim(),
      service_date: parseUsDate(simpleCancel[3]),
      failure_reason: text,
      detected_at,
      source_url,
      raw: item.raw
    };
  }

  // "Birdie has an expired vaccination."
  const vax = text.match(/^(.+?)\s+has an expired vaccination/i);
  if (vax) {
    return {
      id,
      text,
      alert_type: "FITDOG_NOTIFICATION",
      owner_name: "Owner",
      dog_name: vax[1].trim(),
      service_name: "Vaccination",
      service_date: null,
      failure_reason: text,
      detected_at,
      source_url,
      raw: item.raw
    };
  }

  // "Kelsey Leiter uploaded documents to account"
  const docs = text.match(/^(.+?)\s+uploaded documents/i);
  if (docs) {
    return {
      id,
      text,
      alert_type: "FITDOG_NOTIFICATION",
      owner_name: docs[1].trim(),
      dog_name: null,
      service_name: "Document upload",
      service_date: null,
      failure_reason: text,
      detected_at,
      source_url,
      raw: item.raw
    };
  }

  return {
    id,
    text,
    alert_type,
    owner_name: "Fitdog",
    dog_name: null,
    service_name: null,
    service_date: null,
    failure_reason: text || "Fitdog notification",
    detected_at,
    source_url,
    raw: item.raw
  };
}

export function mapNotificationRows(rows: Record<string, unknown>[]): FitdogNotificationItem[] {
  const out: FitdogNotificationItem[] = [];
  for (const row of rows) {
    const text = String(
      row.message || row.text || row.body || row.title || row.content || row.description || ""
    ).trim();
    if (!text) continue;
    const id = String(row.id || row.notification_id || row.uuid || "").trim() || notificationId(text, String(row.created_at || row.timestamp || ""));
    out.push({
      id,
      text,
      detected_at:
        row.created_at != null
          ? String(row.created_at)
          : row.timestamp != null
            ? String(row.timestamp)
            : row.sent_at != null
              ? String(row.sent_at)
              : null,
      source_url: row.url != null ? String(row.url) : row.source_url != null ? String(row.source_url) : "https://app.fitdog.com/dashboard",
      raw: row
    });
  }
  return out;
}
