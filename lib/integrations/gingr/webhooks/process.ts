import { getServiceSupabase } from "@/lib/supabase/server";
import { mapGingrOwnerToContact } from "@/lib/integrations/gingr/mappers/contact";
import type { GingrOwner, GingrWebhookPayload } from "@/lib/integrations/gingr/types";
import { enqueueRufflyJob } from "@/lib/ruffly/queue/jobs";
import {
  gingrWebhookIdempotencyKey,
  sanitizeGingrWebhookPayload,
  verifyGingrWebhookSignature
} from "@/lib/integrations/gingr/webhooks/verify";

export async function ingestGingrWebhook(payload: GingrWebhookPayload) {
  const supabase = getServiceSupabase();
  const valid = verifyGingrWebhookSignature(payload);
  const idempotencyKey = gingrWebhookIdempotencyKey(payload);

  const existing = await supabase
    .from("ruffly_webhook_events")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.data?.status === "processed") {
    return { ok: true, duplicate: true, eventId: existing.data.id };
  }

  if (!valid) {
    const { data } = await supabase
      .from("ruffly_webhook_events")
      .upsert(
        {
          provider: "gingr",
          event_type: String(payload.webhook_type ?? "unknown"),
          external_id: payload.entity_id == null ? null : String(payload.entity_id),
          idempotency_key: idempotencyKey,
          signature_valid: false,
          payload: {},
          sanitized_payload: sanitizeGingrWebhookPayload(payload),
          status: "failed",
          last_error: "Invalid Gingr webhook signature.",
          attempts: 1
        },
        { onConflict: "idempotency_key" }
      )
      .select("id")
      .single();
    return { ok: false, status: 401, error: "Invalid signature.", eventId: data?.id };
  }

  const { data: event, error } = await supabase
    .from("ruffly_webhook_events")
    .upsert(
      {
        provider: "gingr",
        event_type: String(payload.webhook_type ?? "unknown"),
        external_id: payload.entity_id == null ? null : String(payload.entity_id),
        idempotency_key: idempotencyKey,
        signature_valid: true,
        payload: {},
        sanitized_payload: sanitizeGingrWebhookPayload(payload),
        status: "received",
        attempts: 1
      },
      { onConflict: "idempotency_key" }
    )
    .select("id")
    .single();
  if (error) throw error;

  await enqueueRufflyJob({
    jobType: "gingr_webhook_process",
    payload: { eventId: event.id, webhookType: payload.webhook_type, entityId: payload.entity_id },
    idempotencyKey: `process:${idempotencyKey}`
  });

  return { ok: true, duplicate: false, eventId: event.id };
}

export async function processStoredGingrWebhook(eventId: string) {
  const supabase = getServiceSupabase();
  const { data: event, error } = await supabase
    .from("ruffly_webhook_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) return { ok: false, error: "Event not found." };
  if (event.status === "processed") return { ok: true, duplicate: true };

  await supabase.from("ruffly_webhook_events").update({ status: "processing" }).eq("id", eventId);

  try {
    const sanitized = (event.sanitized_payload || {}) as GingrWebhookPayload;
    const type = String(event.event_type || "");

    if (type === "owner_created" || type === "owner_edited") {
      const owner = (sanitized.entity_data || sanitized) as GingrOwner;
      if (owner?.id) {
        const mapped = mapGingrOwnerToContact({ ...owner, id: String(owner.id) });
        const existing = await supabase
          .from("ruffly_contacts")
          .select("id")
          .eq("gingr_owner_id", mapped.gingr_owner_id)
          .maybeSingle();
        if (existing.data?.id) {
          await supabase.from("ruffly_contacts").update({ ...mapped, updated_at: new Date().toISOString() }).eq("id", existing.data.id);
        } else {
          await supabase.from("ruffly_contacts").insert(mapped);
        }
      }
    }

    if (type === "lead_created") {
      const data = (sanitized.entity_data || {}) as Record<string, unknown>;
      await supabase.from("ruffly_leads").insert({
        lead_type: "general_inquiry",
        stage: "new_lead",
        source: "gingr",
        original_message: String(data.message ?? data.notes ?? ""),
        gingr_owner_id: data.owner_id == null ? null : String(data.owner_id),
        metadata: { gingr_entity_id: event.external_id }
      });
    }

    if (type === "check_out" || type === "checking_out") {
      const data = (sanitized.entity_data || {}) as Record<string, unknown>;
      const reservationId = data.reservation_id ?? data.id ?? event.external_id;
      await enqueueRufflyJob({
        jobType: "review_request_from_checkout",
        payload: {
          reservationId: reservationId == null ? null : String(reservationId),
          ownerId: data.owner_id == null ? null : String(data.owner_id),
          serviceType: data.type ?? data.reservation_type ?? null
        },
        idempotencyKey: reservationId ? `review_checkout:${reservationId}` : undefined,
        runAfterMinutes: Number(process.env.RUFFLY_REVIEW_DELAY_MINUTES || 120)
      });
    }

    await supabase
      .from("ruffly_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", eventId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed.";
    await supabase
      .from("ruffly_webhook_events")
      .update({
        status: "failed",
        last_error: message,
        attempts: Number(event.attempts || 0) + 1
      })
      .eq("id", eventId);
    return { ok: false, error: message };
  }
}
