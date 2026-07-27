import {
  classifyPaymentFailure,
  isFailedPaymentEvent,
  isSuccessfulPaymentEvent,
  serviceIsCovered,
  severityForAlertType
} from "@/lib/fitdog-ops/classify";
import { buildFitdogIdempotencyKey } from "@/lib/fitdog-ops/idempotency";
import { isPositiveAmount, normalizeUsdAmount } from "@/lib/fitdog-ops/money";
import { parseFitdogNotification } from "@/lib/fitdog-ops/notifications-parse";
import type {
  FitdogAlertType,
  FitdogPaymentTransaction,
  FitdogServiceRecord,
  FitdogSyncSnapshot,
  NormalizedFitdogEvent,
  OperationsAlert
} from "@/lib/fitdog-ops/types";

export type ProposedAlert = {
  idempotency_key: string;
  alert_type: FitdogAlertType;
  severity: ReturnType<typeof severityForAlertType>;
  source_event_id: string | null;
  source_record_id: string | null;
  owner_id: string | null;
  owner_name: string;
  dog_id: string | null;
  dog_name: string | null;
  reservation_id: string | null;
  invoice_id: string | null;
  transaction_id: string | null;
  service_name: string | null;
  service_date: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  failure_reason: string | null;
  payment_attempt_count: number;
  payment_method_brand: string | null;
  payment_method_last_four: string | null;
  package_credit_check: Record<string, unknown>;
  source_url: string | null;
  detected_at?: string | null;
  auto_resolve_match?: {
    owner_id?: string | null;
    dog_id?: string | null;
    reservation_id?: string | null;
    invoice_id?: string | null;
    amount_due?: number;
  };
};

export type ReconciliationResult = {
  createOrUpdate: ProposedAlert[];
  resolveMatches: Array<{
    transaction: FitdogPaymentTransaction;
    match: ProposedAlert["auto_resolve_match"];
  }>;
  records_scanned: number;
};

function eventToProposed(event: NormalizedFitdogEvent): ProposedAlert | null {
  if (isSuccessfulPaymentEvent(event)) return null;
  if (!isFailedPaymentEvent(event) && !event.failure_reason) return null;

  const alertType = classifyPaymentFailure({
    failure_reason: event.failure_reason,
    status: event.status,
    event_type: event.event_type
  });

  const amountDue = normalizeUsdAmount(event.amount_due);
  const idempotency_key = buildFitdogIdempotencyKey({
    source_event_id: event.source_event_id || event.transaction_id,
    owner_id: event.owner_id,
    dog_id: event.dog_id,
    reservation_id: event.reservation_id,
    invoice_id: event.invoice_id,
    alert_type: alertType,
    amount_due: amountDue
  });

  return {
    idempotency_key,
    alert_type: alertType,
    severity: severityForAlertType(alertType),
    source_event_id: event.source_event_id ?? null,
    source_record_id: event.transaction_id || event.invoice_id || event.reservation_id || null,
    owner_id: event.owner_id ?? null,
    owner_name: event.owner_name || "Owner",
    dog_id: event.dog_id ?? null,
    dog_name: event.dog_name ?? null,
    reservation_id: event.reservation_id ?? null,
    invoice_id: event.invoice_id ?? null,
    transaction_id: event.transaction_id ?? null,
    service_name: event.service_name ?? null,
    service_date: event.service_date ?? event.completed_at ?? null,
    amount_due: amountDue,
    amount_paid: normalizeUsdAmount(event.amount_paid),
    currency: event.currency || "USD",
    failure_reason: event.failure_reason ?? "Payment failed",
    payment_attempt_count: Number(event.payment_attempt_count ?? 1),
    payment_method_brand: event.payment_method_brand ?? null,
    payment_method_last_four: event.payment_method_last_four ?? null,
    package_credit_check: {
      covered_by_package: Boolean(event.covered_by_package),
      covered_by_credit: Boolean(event.covered_by_credit),
      complimentary: Boolean(event.complimentary),
      waived: Boolean(event.waived),
      discounted: Boolean(event.discounted)
    },
    source_url: event.source_url ?? null
  };
}

function notificationToProposed(item: NonNullable<FitdogSyncSnapshot["notifications"]>[number]): ProposedAlert | null {
  const parsed = parseFitdogNotification(item);
  if (!parsed.text) return null;
  const amountDue = 0;
  // Declined Payments / Payment Errors must always stay critical / urgent for staff alerting.
  const severity =
    parsed.alert_type === "CARD_DECLINED" || parsed.alert_type === "PAYMENT_ERROR"
      ? "critical"
      : severityForAlertType(parsed.alert_type);
  return {
    idempotency_key: buildFitdogIdempotencyKey({
      source_event_id: parsed.id,
      owner_id: parsed.owner_name,
      dog_id: parsed.dog_name,
      reservation_id: parsed.service_date,
      invoice_id: null,
      alert_type: parsed.alert_type,
      amount_due: amountDue
    }),
    alert_type: parsed.alert_type,
    severity,
    source_event_id: parsed.id,
    source_record_id: parsed.id,
    owner_id: null,
    owner_name: parsed.owner_name || "Owner",
    dog_id: null,
    dog_name: parsed.dog_name,
    reservation_id: null,
    invoice_id: null,
    transaction_id: parsed.transaction_id ?? null,
    service_name: parsed.service_name,
    service_date: parsed.service_date || parsed.detected_at,
    amount_due: amountDue,
    amount_paid: 0,
    currency: "USD",
    failure_reason: parsed.failure_reason,
    payment_attempt_count:
      parsed.alert_type === "CARD_DECLINED" || parsed.alert_type === "PAYMENT_ERROR" ? 1 : 0,
    payment_method_brand: null,
    payment_method_last_four: null,
    package_credit_check: { source: "fitdog_notification_feed" },
    source_url: parsed.source_url,
    detected_at: parsed.detected_at
  };
}

function paymentToProposed(payment: FitdogPaymentTransaction): ProposedAlert | null {
  const status = String(payment.status || "").toLowerCase();
  if (/(success|paid|captured|settled|approved)/.test(status)) return null;
  if (!/(fail|declin|error|reject|expired|missing|unpaid|due)/.test(status) && !payment.failure_reason) {
    return null;
  }

  const alertType = classifyPaymentFailure({
    failure_reason: payment.failure_reason,
    status: payment.status,
    event_type: "payment"
  });
  const amountDue = normalizeUsdAmount(payment.amount);

  return {
    idempotency_key: buildFitdogIdempotencyKey({
      source_event_id: payment.fitdog_transaction_id,
      owner_id: payment.fitdog_owner_id,
      dog_id: payment.fitdog_dog_id,
      reservation_id: payment.fitdog_reservation_id,
      invoice_id: payment.fitdog_invoice_id,
      alert_type: alertType,
      amount_due: amountDue
    }),
    alert_type: alertType,
    severity: severityForAlertType(alertType),
    source_event_id: payment.fitdog_transaction_id,
    source_record_id: payment.fitdog_transaction_id,
    owner_id: payment.fitdog_owner_id ?? null,
    owner_name: "Owner",
    dog_id: payment.fitdog_dog_id ?? null,
    dog_name: null,
    reservation_id: payment.fitdog_reservation_id ?? null,
    invoice_id: payment.fitdog_invoice_id ?? null,
    transaction_id: payment.fitdog_transaction_id,
    service_name: null,
    service_date: payment.attempted_at ?? null,
    amount_due: amountDue,
    amount_paid: 0,
    currency: payment.currency || "USD",
    failure_reason: payment.failure_reason ?? "Payment failed",
    payment_attempt_count: Number(payment.attempt_number ?? 1),
    payment_method_brand: payment.payment_method_brand ?? null,
    payment_method_last_four: payment.payment_method_last_four ?? null,
    package_credit_check: {},
    source_url: payment.source_url ?? null
  };
}

export function evaluateMissedPayment(service: FitdogServiceRecord, options: {
  graceMinutes: number;
  now?: Date;
  hasSuccessfulPayment?: boolean;
  existingOpenAlert?: boolean;
}): ProposedAlert | null {
  const now = options.now ?? new Date();
  const completedAt = service.completed_at || service.service_date;
  if (!service.attended && !completedAt) return null;
  if (!completedAt) return null;

  const completedMs = new Date(completedAt).getTime();
  if (!Number.isFinite(completedMs)) return null;
  const graceMs = Math.max(0, options.graceMinutes) * 60 * 1000;
  if (now.getTime() < completedMs + graceMs) return null;

  const covered = serviceIsCovered({
    amount_due: service.amount_due,
    covered_by_package: service.covered_by_package,
    covered_by_credit: service.covered_by_credit,
    complimentary: service.complimentary,
    waived: service.waived,
    discounted: service.discounted
  });
  if (covered) return null;
  if (!isPositiveAmount(service.amount_due)) return null;
  if (options.hasSuccessfulPayment) return null;
  if (options.existingOpenAlert) return null;

  const amountDue = normalizeUsdAmount(service.amount_due);
  const alertType: FitdogAlertType = "PAYMENT_MISSED";
  return {
    idempotency_key: buildFitdogIdempotencyKey({
      source_event_id: null,
      owner_id: service.fitdog_owner_id,
      dog_id: service.fitdog_dog_id,
      reservation_id: service.fitdog_reservation_id || service.fitdog_service_id,
      invoice_id: null,
      alert_type: alertType,
      amount_due: amountDue
    }),
    alert_type: alertType,
    severity: severityForAlertType(alertType),
    source_event_id: null,
    source_record_id: service.fitdog_service_id,
    owner_id: service.fitdog_owner_id ?? null,
    owner_name: service.owner_name || "Owner",
    dog_id: service.fitdog_dog_id ?? null,
    dog_name: service.dog_name ?? null,
    reservation_id: service.fitdog_reservation_id ?? null,
    invoice_id: null,
    transaction_id: null,
    service_name: service.service_name,
    service_date: service.service_date ?? service.completed_at ?? null,
    amount_due: amountDue,
    amount_paid: 0,
    currency: service.currency || "USD",
    failure_reason: "No successful payment after grace period for completed/attended service.",
    payment_attempt_count: 0,
    payment_method_brand: null,
    payment_method_last_four: null,
    package_credit_check: {
      covered_by_package: Boolean(service.covered_by_package),
      covered_by_credit: Boolean(service.covered_by_credit),
      complimentary: Boolean(service.complimentary),
      waived: Boolean(service.waived),
      discounted: Boolean(service.discounted),
      amount_due: amountDue
    },
    source_url: service.source_url ?? null
  };
}

export function reconcileFitdogSnapshot(
  snapshot: FitdogSyncSnapshot,
  options: {
    graceMinutes: number;
    now?: Date;
    existingOpenKeys?: Set<string>;
  }
): ReconciliationResult {
  const createOrUpdate: ProposedAlert[] = [];
  const seen = new Set<string>();
  const resolveMatches: ReconciliationResult["resolveMatches"] = [];

  for (const event of snapshot.events || []) {
    if (isSuccessfulPaymentEvent(event)) {
      resolveMatches.push({
        transaction: {
          fitdog_transaction_id: String(event.transaction_id || event.source_event_id || `success-${seen.size}`),
          fitdog_owner_id: event.owner_id,
          fitdog_dog_id: event.dog_id,
          fitdog_reservation_id: event.reservation_id,
          fitdog_invoice_id: event.invoice_id,
          status: "paid",
          amount: normalizeUsdAmount(event.amount_paid || event.amount_due),
          currency: event.currency || "USD",
          succeeded_at: event.completed_at || new Date().toISOString(),
          source_url: event.source_url
        },
        match: {
          owner_id: event.owner_id,
          dog_id: event.dog_id,
          reservation_id: event.reservation_id,
          invoice_id: event.invoice_id,
          amount_due: normalizeUsdAmount(event.amount_due || event.amount_paid)
        }
      });
      continue;
    }
    const proposed = eventToProposed(event);
    if (!proposed || seen.has(proposed.idempotency_key)) continue;
    seen.add(proposed.idempotency_key);
    createOrUpdate.push(proposed);
  }

  const successfulPayments = new Set<string>();
  for (const payment of snapshot.payments || []) {
    const status = String(payment.status || "").toLowerCase();
    if (/(success|paid|captured|settled|approved)/.test(status)) {
      successfulPayments.add(
        [
          part(payment.fitdog_owner_id),
          part(payment.fitdog_dog_id),
          part(payment.fitdog_reservation_id),
          part(payment.fitdog_invoice_id)
        ].join(":")
      );
      resolveMatches.push({
        transaction: payment,
        match: {
          owner_id: payment.fitdog_owner_id,
          dog_id: payment.fitdog_dog_id,
          reservation_id: payment.fitdog_reservation_id,
          invoice_id: payment.fitdog_invoice_id,
          amount_due: normalizeUsdAmount(payment.amount)
        }
      });
      continue;
    }
    const proposed = paymentToProposed(payment);
    if (!proposed || seen.has(proposed.idempotency_key)) continue;
    seen.add(proposed.idempotency_key);
    createOrUpdate.push(proposed);
  }

  for (const invoice of snapshot.invoices || []) {
    const due = normalizeUsdAmount(invoice.amount_due);
    const paid = normalizeUsdAmount(invoice.amount_paid);
    const outstanding = Math.max(0, due - paid);
    if (outstanding <= 0) continue;
    if (/paid|void|waived/i.test(String(invoice.status || ""))) continue;
    const alertType: FitdogAlertType = "OUTSTANDING_BALANCE";
    const proposed: ProposedAlert = {
      idempotency_key: buildFitdogIdempotencyKey({
        source_event_id: invoice.fitdog_invoice_id,
        owner_id: invoice.fitdog_owner_id,
        dog_id: invoice.fitdog_dog_id,
        reservation_id: invoice.fitdog_reservation_id,
        invoice_id: invoice.fitdog_invoice_id,
        alert_type: alertType,
        amount_due: outstanding
      }),
      alert_type: alertType,
      severity: severityForAlertType(alertType),
      source_event_id: invoice.fitdog_invoice_id,
      source_record_id: invoice.fitdog_invoice_id,
      owner_id: invoice.fitdog_owner_id ?? null,
      owner_name: "Owner",
      dog_id: invoice.fitdog_dog_id ?? null,
      dog_name: null,
      reservation_id: invoice.fitdog_reservation_id ?? null,
      invoice_id: invoice.fitdog_invoice_id,
      transaction_id: null,
      service_name: null,
      service_date: invoice.due_at ?? null,
      amount_due: outstanding,
      amount_paid: paid,
      currency: invoice.currency || "USD",
      failure_reason: "Outstanding unpaid balance",
      payment_attempt_count: 0,
      payment_method_brand: null,
      payment_method_last_four: null,
      package_credit_check: {},
      source_url: invoice.source_url ?? null
    };
    if (seen.has(proposed.idempotency_key)) continue;
    seen.add(proposed.idempotency_key);
    createOrUpdate.push(proposed);
  }

  for (const service of snapshot.services || []) {
    const paymentKey = [
      part(service.fitdog_owner_id),
      part(service.fitdog_dog_id),
      part(service.fitdog_reservation_id),
      "none"
    ].join(":");
    const proposed = evaluateMissedPayment(service, {
      graceMinutes: options.graceMinutes,
      now: options.now,
      hasSuccessfulPayment: successfulPayments.has(paymentKey) || [...successfulPayments].some((key) => {
        const [owner, dog, reservation] = key.split(":");
        return (
          (!service.fitdog_owner_id || owner === part(service.fitdog_owner_id)) &&
          (!service.fitdog_dog_id || dog === part(service.fitdog_dog_id)) &&
          (!service.fitdog_reservation_id || reservation === part(service.fitdog_reservation_id))
        );
      }),
      existingOpenAlert: options.existingOpenKeys?.has(
        buildFitdogIdempotencyKey({
          owner_id: service.fitdog_owner_id,
          dog_id: service.fitdog_dog_id,
          reservation_id: service.fitdog_reservation_id || service.fitdog_service_id,
          invoice_id: null,
          alert_type: "PAYMENT_MISSED",
          amount_due: service.amount_due
        })
      )
    });
    if (!proposed || seen.has(proposed.idempotency_key)) continue;
    seen.add(proposed.idempotency_key);
    createOrUpdate.push(proposed);
  }

  for (const notification of snapshot.notifications || []) {
    const proposed = notificationToProposed(notification);
    if (!proposed || seen.has(proposed.idempotency_key)) continue;
    seen.add(proposed.idempotency_key);
    createOrUpdate.push(proposed);
  }

  return {
    createOrUpdate,
    resolveMatches,
    records_scanned:
      (snapshot.payments?.length || 0) +
      (snapshot.services?.length || 0) +
      (snapshot.invoices?.length || 0) +
      (snapshot.events?.length || 0) +
      (snapshot.reservations?.length || 0) +
      (snapshot.notifications?.length || 0)
  };
}

function part(value: unknown) {
  return String(value ?? "").trim().toLowerCase() || "none";
}

export function alertMatchesSuccessfulPayment(
  alert: Pick<OperationsAlert, "owner_id" | "dog_id" | "reservation_id" | "invoice_id" | "amount_due" | "alert_type" | "status">,
  match: ProposedAlert["auto_resolve_match"]
): boolean {
  if (!match) return false;
  if (!["PAYMENT_FAILED", "PAYMENT_MISSED", "CARD_DECLINED", "CARD_EXPIRED", "CARD_MISSING", "PAYMENT_PROCESSING_ERROR", "PAYMENT_RETRY_FAILED", "PAYMENT_ERROR", "OUTSTANDING_BALANCE"].includes(alert.alert_type)) {
    return false;
  }
  if (match.invoice_id && alert.invoice_id && match.invoice_id === alert.invoice_id) return true;
  if (match.reservation_id && alert.reservation_id && match.reservation_id === alert.reservation_id) return true;
  if (match.owner_id && alert.owner_id && match.owner_id === alert.owner_id) {
    if (match.dog_id && alert.dog_id && match.dog_id !== alert.dog_id) return false;
    if (match.amount_due != null && Math.abs(normalizeUsdAmount(match.amount_due) - normalizeUsdAmount(alert.amount_due)) > 0.009) {
      return false;
    }
    return true;
  }
  return false;
}
