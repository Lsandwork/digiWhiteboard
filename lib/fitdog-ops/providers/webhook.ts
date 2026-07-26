import type { NormalizedFitdogEvent } from "@/lib/fitdog-ops/types";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";
import { maskLastFour } from "@/lib/fitdog-ops/sanitize";

export function normalizeFitdogWebhookPayload(payload: unknown): NormalizedFitdogEvent {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
  const paymentMethod = (data.payment_method && typeof data.payment_method === "object"
    ? data.payment_method
    : {}) as Record<string, unknown>;

  return {
    source_event_id: data.id != null ? String(data.id) : body.id != null ? String(body.id) : body.event_id != null ? String(body.event_id) : null,
    event_type: String(body.type || body.event_type || data.event_type || "payment"),
    owner_id: data.owner_id != null ? String(data.owner_id) : data.customer_id != null ? String(data.customer_id) : null,
    owner_name: data.owner_name != null ? String(data.owner_name) : data.customer_name != null ? String(data.customer_name) : null,
    dog_id: data.dog_id != null ? String(data.dog_id) : data.animal_id != null ? String(data.animal_id) : null,
    dog_name: data.dog_name != null ? String(data.dog_name) : data.animal_name != null ? String(data.animal_name) : null,
    reservation_id: data.reservation_id != null ? String(data.reservation_id) : null,
    invoice_id: data.invoice_id != null ? String(data.invoice_id) : null,
    transaction_id: data.transaction_id != null ? String(data.transaction_id) : data.payment_id != null ? String(data.payment_id) : null,
    service_name: data.service_name != null ? String(data.service_name) : null,
    service_date: data.service_date != null ? String(data.service_date) : null,
    amount_due: Number(data.amount_due ?? data.amount ?? 0),
    amount_paid: Number(data.amount_paid ?? 0),
    currency: String(data.currency || "USD"),
    failure_reason: data.failure_reason != null ? String(data.failure_reason) : data.message != null ? String(data.message) : null,
    payment_attempt_count: Number(data.attempt_count ?? data.payment_attempt_count ?? 1),
    payment_method_brand: paymentMethod.brand != null ? String(paymentMethod.brand) : data.card_brand != null ? String(data.card_brand) : null,
    payment_method_last_four: maskLastFour(paymentMethod.last_four ?? data.last_four ?? data.card_last_four),
    status: data.status != null ? String(data.status) : null,
    source_url: data.source_url != null ? String(data.source_url) : data.url != null ? String(data.url) : null,
    covered_by_package: Boolean(data.covered_by_package),
    covered_by_credit: Boolean(data.covered_by_credit),
    complimentary: Boolean(data.complimentary),
    waived: Boolean(data.waived),
    discounted: Boolean(data.discounted),
    attended: Boolean(data.attended),
    completed_at: data.completed_at != null ? String(data.completed_at) : null,
    raw: sanitizeFitdogPayload(body) as Record<string, unknown>
  };
}
