import type { FitdogAlertType } from "@/lib/fitdog-ops/types";
import { normalizeUsdAmount } from "@/lib/fitdog-ops/money";

function part(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || "none";
}

export function buildFitdogIdempotencyKey(input: {
  source_event_id?: string | null;
  owner_id?: string | null;
  dog_id?: string | null;
  reservation_id?: string | null;
  invoice_id?: string | null;
  alert_type: FitdogAlertType;
  amount_due?: number | null;
}): string {
  const sourceEventId = String(input.source_event_id ?? "").trim();
  if (sourceEventId) return `fitdog:${sourceEventId}`;
  return [
    "fitdog",
    part(input.owner_id),
    part(input.dog_id),
    part(input.reservation_id),
    part(input.invoice_id),
    part(input.alert_type),
    normalizeUsdAmount(input.amount_due).toFixed(2)
  ].join(":");
}
