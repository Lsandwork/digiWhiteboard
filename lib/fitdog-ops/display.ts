import {
  OPEN_ALERT_STATUSES,
  type FitdogAlertType,
  type OperationsAlertStatus
} from "@/lib/fitdog-ops/types";

const CLOSED_ALERT_STATUSES = new Set<OperationsAlertStatus>([
  "paid",
  "waived",
  "false_positive",
  "resolved"
]);

export function isClosedAlertStatus(status: string | null | undefined) {
  return CLOSED_ALERT_STATUSES.has(String(status || "") as OperationsAlertStatus);
}

export function isOpenAlertStatus(status: string | null | undefined) {
  return OPEN_ALERT_STATUSES.includes(String(status || "") as OperationsAlertStatus);
}

/** Closed payment/ops alerts display as RESOLVED in the UI. */
export function formatOperationsAlertStatus(status: string | null | undefined) {
  const value = String(status || "").trim();
  if (!value) return "—";
  if (isClosedAlertStatus(value)) return "RESOLVED";
  return value.replace(/_/g, " ").toUpperCase();
}

export function formatFitdogAlertType(alertType: string | null | undefined) {
  switch (String(alertType || "")) {
    case "CARD_DECLINED":
      return "Declined Payment";
    case "PAYMENT_FAILED":
      return "Failed Payment";
    case "PAYMENT_MISSED":
      return "Missed Payment";
    case "CARD_EXPIRED":
      return "Card Expired";
    case "CARD_MISSING":
      return "Card Missing";
    case "PAYMENT_PROCESSING_ERROR":
      return "Processing Error";
    case "PAYMENT_RETRY_FAILED":
      return "Retry Failed";
    case "PAYMENT_ERROR":
      return "Payment Error";
    case "OUTSTANDING_BALANCE":
      return "Outstanding Balance";
    case "PAYMENT_RESOLVED":
      return "Resolved Payment";
    case "FITDOG_NOTIFICATION":
      return "Fitdog Notification";
    case "FITDOG_SYNC_ERROR":
      return "Sync Error";
    default:
      return String(alertType || "Alert").replace(/_/g, " ");
  }
}

export function isDeclinedPaymentAlert(alert: {
  alert_type?: FitdogAlertType | string | null;
  failure_reason?: string | null;
}) {
  if (alert.alert_type === "CARD_DECLINED") return true;
  if (alert.alert_type === "PAYMENT_RESOLVED" && /declin/i.test(String(alert.failure_reason || ""))) {
    return true;
  }
  return false;
}

/** Card-update / charge failures from Fitdog PAYMENT ERROR notifications. */
export function isPaymentErrorAlert(alert: {
  alert_type?: FitdogAlertType | string | null;
  failure_reason?: string | null;
}) {
  if (alert.alert_type === "PAYMENT_ERROR") return true;
  return /PAYMENT\s*ERROR|needs to update credit card|Failed to charge amount/i.test(
    String(alert.failure_reason || "")
  );
}
