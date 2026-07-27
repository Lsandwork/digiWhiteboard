import type { FitdogAlertSeverity, FitdogAlertType, NormalizedFitdogEvent } from "@/lib/fitdog-ops/types";
import { isPositiveAmount, normalizeUsdAmount } from "@/lib/fitdog-ops/money";

const DECLINED = /declin|reject|do not honor|insufficient|over.?limit|pick.?up|stolen|lost.?card|fraud/i;
const EXPIRED = /expir/i;
const MISSING = /no card|missing card|no payment method|payment method required|card on file/i;
const RETRY = /retry|attempt\s*[2-9]|re-?try fail/i;
const PROCESSING = /processor|gateway|timeout|unavailable|processing error|network/i;

export function classifyPaymentFailure(input: {
  failure_reason?: string | null;
  status?: string | null;
  event_type?: string | null;
}): FitdogAlertType {
  const blob = `${input.failure_reason || ""} ${input.status || ""} ${input.event_type || ""}`;
  if (/PAYMENT\s*ERROR|needs to update credit card|Failed to charge amount|has already been captured/i.test(blob)) {
    return "PAYMENT_ERROR";
  }
  if (MISSING.test(blob)) return "CARD_MISSING";
  if (EXPIRED.test(blob)) return "CARD_EXPIRED";
  if (RETRY.test(blob)) return "PAYMENT_RETRY_FAILED";
  if (DECLINED.test(blob)) return "CARD_DECLINED";
  if (PROCESSING.test(blob)) return "PAYMENT_PROCESSING_ERROR";
  return "PAYMENT_FAILED";
}

export function severityForAlertType(alertType: FitdogAlertType): FitdogAlertSeverity {
  switch (alertType) {
    case "PAYMENT_FAILED":
    case "PAYMENT_MISSED":
    case "CARD_DECLINED":
    case "PAYMENT_RETRY_FAILED":
    case "PAYMENT_ERROR":
      return "critical";
    case "CARD_EXPIRED":
    case "CARD_MISSING":
      return "high";
    case "OUTSTANDING_BALANCE":
    case "FITDOG_SYNC_ERROR":
    case "PAYMENT_PROCESSING_ERROR":
    case "FITDOG_NOTIFICATION":
      return "medium";
    case "PAYMENT_RESOLVED":
      return "low";
    default:
      return "medium";
  }
}

export function isFailedPaymentEvent(event: NormalizedFitdogEvent): boolean {
  const status = String(event.status || "").toLowerCase();
  const type = String(event.event_type || "").toLowerCase();
  if (/(success|paid|captured|settled|approved)/.test(status) || /(payment[_-]?success|payment[_-]?paid)/.test(type)) {
    return false;
  }
  if (/(fail|declin|error|reject|expired|missing)/.test(status) || /(payment[_-]?fail|card[_-]?declin|card[_-]?expir|card[_-]?miss)/.test(type)) {
    return true;
  }
  return Boolean(event.failure_reason);
}

export function isSuccessfulPaymentEvent(event: NormalizedFitdogEvent): boolean {
  const status = String(event.status || event.event_type || "").toLowerCase();
  return /(success|paid|captured|settled|approved|payment[_-]?success|payment[_-]?paid)/.test(status);
}

export function serviceIsCovered(input: {
  amount_due?: number | null;
  covered_by_package?: boolean;
  covered_by_credit?: boolean;
  complimentary?: boolean;
  waived?: boolean;
  discounted?: boolean;
}): boolean {
  if (input.covered_by_package || input.covered_by_credit || input.complimentary || input.waived) return true;
  if (!isPositiveAmount(input.amount_due)) return true;
  if (input.discounted && normalizeUsdAmount(input.amount_due) <= 0) return true;
  return false;
}
