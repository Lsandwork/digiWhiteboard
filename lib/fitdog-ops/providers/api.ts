import { fitdogApiBaseUrl, fitdogApiToken } from "@/lib/fitdog-ops/config";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";
import type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";
import type { FitdogPaymentTransaction, FitdogServiceRecord, NormalizedFitdogEvent } from "@/lib/fitdog-ops/types";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapPayment(row: Record<string, unknown>): FitdogPaymentTransaction {
  return {
    fitdog_transaction_id: String(row.id || row.transaction_id || row.fitdog_transaction_id || ""),
    fitdog_owner_id: row.owner_id != null ? String(row.owner_id) : null,
    fitdog_dog_id: row.dog_id != null ? String(row.dog_id) : null,
    fitdog_reservation_id: row.reservation_id != null ? String(row.reservation_id) : null,
    fitdog_invoice_id: row.invoice_id != null ? String(row.invoice_id) : null,
    status: String(row.status || "unknown"),
    amount: Number(row.amount ?? row.amount_due ?? 0),
    currency: String(row.currency || "USD"),
    failure_reason: row.failure_reason != null ? String(row.failure_reason) : row.message != null ? String(row.message) : null,
    payment_method_brand: row.payment_method_brand != null ? String(row.payment_method_brand) : null,
    payment_method_last_four: row.payment_method_last_four != null ? String(row.payment_method_last_four) : null,
    attempt_number: Number(row.attempt_number ?? 1),
    attempted_at: row.attempted_at != null ? String(row.attempted_at) : row.created_at != null ? String(row.created_at) : null,
    succeeded_at: row.succeeded_at != null ? String(row.succeeded_at) : null,
    source_url: row.source_url != null ? String(row.source_url) : null,
    raw: sanitizeFitdogPayload(row) as Record<string, unknown>
  };
}

function mapService(row: Record<string, unknown>): FitdogServiceRecord {
  return {
    fitdog_service_id: String(row.id || row.service_id || row.fitdog_service_id || ""),
    fitdog_reservation_id: row.reservation_id != null ? String(row.reservation_id) : null,
    fitdog_owner_id: row.owner_id != null ? String(row.owner_id) : null,
    fitdog_dog_id: row.dog_id != null ? String(row.dog_id) : null,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    dog_name: row.dog_name != null ? String(row.dog_name) : null,
    service_name: String(row.service_name || row.name || "Service"),
    service_date: row.service_date != null ? String(row.service_date) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    attended: Boolean(row.attended ?? row.completed ?? false),
    amount_due: Number(row.amount_due ?? row.amount ?? 0),
    currency: String(row.currency || "USD"),
    covered_by_package: Boolean(row.covered_by_package),
    covered_by_credit: Boolean(row.covered_by_credit),
    complimentary: Boolean(row.complimentary || row.comp),
    discounted: Boolean(row.discounted),
    waived: Boolean(row.waived),
    adjustment_notes: row.adjustment_notes != null ? String(row.adjustment_notes) : null,
    source_url: row.source_url != null ? String(row.source_url) : null,
    raw: sanitizeFitdogPayload(row) as Record<string, unknown>
  };
}

export class FitdogApiProvider implements FitdogIntegrationProvider {
  readonly mode = "api" as const;

  async sync(options: FitdogProviderSyncOptions): Promise<FitdogProviderSyncResult> {
    const base = fitdogApiBaseUrl();
    const token = fitdogApiToken();
    if (!base || !token) {
      throw new Error("FITDOG_API_BASE_URL and FITDOG_API_TOKEN are required for API mode.");
    }

    const days = options.days ?? 30;
    const since = options.since || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const url = new URL("/v1/operations/sync", base.replace(/\/$/, ""));
    url.searchParams.set("since", since);
    url.searchParams.set("mode", options.mode);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Fitdog API sync failed (${response.status}).`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const payments = asArray(json.payments).map((row) => mapPayment(row as Record<string, unknown>)).filter((row) => row.fitdog_transaction_id);
    const services = asArray(json.services).map((row) => mapService(row as Record<string, unknown>)).filter((row) => row.fitdog_service_id);
    const events = asArray(json.events).map((row) => row as NormalizedFitdogEvent);

    return {
      payments,
      services,
      invoices: asArray(json.invoices) as FitdogProviderSyncResult["invoices"],
      customers: asArray(json.customers) as FitdogProviderSyncResult["customers"],
      dogs: asArray(json.dogs) as FitdogProviderSyncResult["dogs"],
      reservations: asArray(json.reservations) as FitdogProviderSyncResult["reservations"],
      events,
      records_scanned: payments.length + services.length + events.length,
      checkpoint: { since: new Date().toISOString(), ...(options.checkpoint || {}) }
    };
  }
}
