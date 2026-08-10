import { after } from "next/server";
import { NextResponse } from "next/server";
import { resolveActiveCheckinDisplayUntil, shouldExpireCheckinDog } from "@/lib/checkin-display";
import { resolveActiveCheckoutDisplayUntil, shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { invalidateBoardTransitionCaches } from "@/lib/board-settings-cache";
import { getGingrWebhookSignatureKey } from "@/lib/env";
import { normalizeDog, verifyGingrSignature, type GingrWebhookPayload } from "@/lib/gingr";
import { shellyCheckinAlertKey, shellyCheckoutAlertKey, triggerShellyAlert } from "@/lib/shelly-alert";
import { upsertIncidentFromGingrWebhook } from "@/lib/staff/track-incidents";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isContinuingSameTransition, shouldHideCompletedDog } from "@/lib/transition-cleanup";
import type { LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

const activeTypes = new Set(["checking_in", "checking_out"]);
const completionTypes = new Set(["check_in", "check_out", "checked_in", "checked_out"]);
const incidentTypes = new Set(["incident_created", "incident_edited"]);
const acceptedPassiveTypes = new Set([
  "animal_created",
  "animal_edited",
  "owner_created",
  "owner_edited"
]);
/** Known Gingr noise we acknowledge but do not action — never 500 (retries hurt Gingr). */
const ignoredWebhookTypes = new Set([
  "email_sent",
  "reservation_form_edited",
  "reservation_form_created",
  "sms_sent",
  "notification_sent"
]);

function completionStatus(webhookType: string) {
  if (webhookType === "check_in" || webhookType === "checked_in") return "checked_in";
  return "checked_out";
}

function isCheckoutCompletion(webhookType: string) {
  return webhookType === "check_out" || webhookType === "checked_out";
}

const NO_EVENT_ID = "00000000-0000-0000-0000-000000000000";

async function recordWebhookEvent(
  supabase: ReturnType<typeof getServiceSupabase>,
  payload: GingrWebhookPayload,
  webhookType: string,
  verified: boolean,
  options: { processed: boolean; processingError?: string | null }
) {
  const { data } = await supabase
    .from("gingr_webhook_events")
    .insert({
      webhook_type: webhookType || null,
      entity_id: payload.entity_id ? String(payload.entity_id) : null,
      entity_type: payload.entity_type ?? null,
      signature: payload.signature ?? null,
      verified,
      processed: options.processed,
      processing_error: options.processingError ?? null,
      payload
    })
    .select("id")
    .single();

  return data?.id ?? null;
}

/** Guards duplicate side effects (alerts) without blocking the board write. */
async function hasRecentDuplicateEvent(
  supabase: ReturnType<typeof getServiceSupabase>,
  webhookType: string,
  entityId: string | null,
  excludeEventId: string | null
) {
  if (!entityId) return false;
  const { data } = await supabase
    .from("gingr_webhook_events")
    .select("id")
    .eq("webhook_type", webhookType)
    .eq("entity_id", entityId)
    .eq("verified", true)
    .eq("processed", true)
    .neq("id", excludeEventId ?? NO_EVENT_ID)
    .gte("created_at", new Date(Date.now() - 30_000).toISOString())
    .limit(1);

  return Boolean(data?.length);
}

async function findExistingDog(supabase: ReturnType<typeof getServiceSupabase>, reservationId: string | null, animalId: string | null) {
  if (reservationId) {
    const { data } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("gingr_reservation_id", reservationId)
      .maybeSingle();
    if (data) return data;
  }

  if (animalId) {
    const { data } = await supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("gingr_animal_id", animalId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as GingrWebhookPayload;
  const supabase = getServiceSupabase();
  const webhookType = String(payload.webhook_type ?? "");
  const verified = verifyGingrSignature(payload, getGingrWebhookSignatureKey());

  // A dog appearing on the whiteboard is the only latency-critical outcome here.
  // Write the transition first and defer the audit row, dedupe, and alerts to
  // after() — that is one Supabase round trip instead of four before the board
  // (and Realtime) can see the dog.
  if (verified && activeTypes.has(webhookType)) {
    const dog = normalizeDog(payload);
    const entityId = payload.entity_id ? String(payload.entity_id) : null;

    try {
      const existing = await findExistingDog(supabase, dog.gingr_reservation_id, dog.gingr_animal_id);
      const nowDate = new Date();
      const now = nowDate.toISOString();
      const windowExpired =
        existing &&
        !existing.hidden &&
        (webhookType === "checking_out"
          ? shouldExpireCheckoutDog(existing as LiveDog, nowDate)
          : shouldExpireCheckinDog(existing as LiveDog, nowDate));
      const continuing =
        !windowExpired && isContinuingSameTransition(existing, webhookType as "checking_in" | "checking_out");
      const statusStartedAt = continuing && existing?.status_started_at ? existing.status_started_at : now;
      const existingUntil = continuing ? existing?.display_until : null;
      const row = {
        ...dog,
        current_status: webhookType,
        display_status: webhookType,
        hidden: false,
        status_started_at: statusStartedAt,
        completed_at: continuing ? existing?.completed_at ?? null : null,
        display_until:
          webhookType === "checking_out"
            ? resolveActiveCheckoutDisplayUntil(statusStartedAt, existingUntil, nowDate)
            : resolveActiveCheckinDisplayUntil(statusStartedAt, existingUntil, nowDate),
        last_seen_from_gingr_at: now,
        raw_payload: { ...payload, source: "gingr_webhook" },
        updated_at: now
      };

      const mutation = existing
        ? supabase.from("live_transition_dogs").update(row).eq("id", existing.id).select("*").single()
        : supabase.from("live_transition_dogs").insert(row).select("*").single();
      const { data: savedDog, error } = await mutation;
      if (error) throw error;

      invalidateBoardTransitionCaches();

      after(async () => {
        const eventId = await recordWebhookEvent(supabase, payload, webhookType, verified, { processed: true });

        await supabase.from("board_activity_log").insert({
          gingr_reservation_id: dog.gingr_reservation_id,
          animal_name: dog.animal_name,
          action: webhookType,
          previous_status: existing?.current_status ?? null,
          new_status: webhookType,
          source: "webhook",
          details: { dog_id: savedDog.id }
        });

        if (continuing) return;
        if (await hasRecentDuplicateEvent(supabase, webhookType, entityId, eventId)) return;

        if (webhookType === "checking_in") {
          await triggerShellyAlert("dog_check_in", shellyCheckinAlertKey(savedDog));
          try {
            const { evaluateFighterRotationAlertForCheckIn } = await import(
              "@/lib/staff/fighter-rotation-alerts"
            );
            await evaluateFighterRotationAlertForCheckIn(supabase, savedDog);
          } catch (error) {
            console.error("fighter-rotation: check-in alert failed", error);
          }
        } else if (webhookType === "checking_out") {
          await triggerShellyAlert("dog_check_out", shellyCheckoutAlertKey(savedDog));
        }
      });

      return NextResponse.json({ ok: true, webhook_type: webhookType });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed.";
      after(async () => {
        await recordWebhookEvent(supabase, payload, webhookType, verified, {
          processed: false,
          processingError: message
        });
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { data: event, error: eventError } = await supabase
    .from("gingr_webhook_events")
    .insert({
      webhook_type: webhookType || null,
      entity_id: payload.entity_id ? String(payload.entity_id) : null,
      entity_type: payload.entity_type ?? null,
      signature: payload.signature ?? null,
      verified,
      processed: false,
      payload
    })
    .select("id")
    .single();

  if (eventError) {
    return NextResponse.json({ error: "Unable to store webhook event." }, { status: 500 });
  }

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 403 });
  }

  if (payload.entity_id) {
    const dedupeSince = new Date(Date.now() - 30_000).toISOString();
    const { data: duplicateEvents } = await supabase
      .from("gingr_webhook_events")
      .select("id")
      .eq("webhook_type", webhookType)
      .eq("entity_id", String(payload.entity_id))
      .eq("verified", true)
      .eq("processed", true)
      .neq("id", event.id)
      .gte("created_at", dedupeSince)
      .limit(1);

    if (duplicateEvents?.length) {
      await supabase.from("gingr_webhook_events").update({ processed: true }).eq("id", event.id);
      return NextResponse.json({ ok: true, webhook_type: webhookType, deduplicated: true });
    }
  }

  try {
    if (
      ignoredWebhookTypes.has(webhookType) ||
      (!activeTypes.has(webhookType) &&
        !completionTypes.has(webhookType) &&
        !acceptedPassiveTypes.has(webhookType) &&
        !incidentTypes.has(webhookType))
    ) {
      // Acknowledge unknown/noise types so Gingr does not retry and audit stays clean.
      await supabase
        .from("gingr_webhook_events")
        .update({ processed: true, processing_error: null })
        .eq("id", event.id);
      return NextResponse.json({ ok: true, webhook_type: webhookType, ignored: true });
    }

    if (incidentTypes.has(webhookType)) {
      // Upsert into Track Incidents ledger; never call Gingr HTTP from the webhook path.
      await upsertIncidentFromGingrWebhook(supabase, payload, event.id);
      await supabase.from("gingr_webhook_events").update({ processed: true }).eq("id", event.id);
      return NextResponse.json({ ok: true, webhook_type: webhookType });
    }

    if (acceptedPassiveTypes.has(webhookType)) {
      const dog = normalizeDog(payload);
      if (dog.gingr_animal_id && (webhookType === "animal_edited" || webhookType === "animal_created")) {
        const { invalidateGingrCustomAnimalIconsCache } = await import("@/lib/gingr-custom-animal-icons");
        invalidateGingrCustomAnimalIconsCache(dog.gingr_animal_id);
      }
      if (dog.gingr_animal_id || dog.gingr_reservation_id) {
        const existing = await findExistingDog(supabase, dog.gingr_reservation_id, dog.gingr_animal_id);
        const now = new Date().toISOString();
        const photoPatch = {
          photo_url: dog.photo_url,
          animal_name: dog.animal_name,
          owner_name: dog.owner_name,
          last_seen_from_gingr_at: now,
          raw_payload: payload,
          updated_at: now
        };

        if (existing) {
          await supabase
            .from("live_transition_dogs")
            .update({
              ...photoPatch,
              animal_name: dog.animal_name || existing.animal_name,
              owner_name: dog.owner_name ?? existing.owner_name
            })
            .eq("id", existing.id);
        } else if (dog.gingr_animal_id) {
          await supabase
            .from("live_transition_dogs")
            .update(photoPatch)
            .eq("gingr_animal_id", dog.gingr_animal_id)
            .eq("hidden", false);
        }
      }
    }

    if (completionTypes.has(webhookType)) {
      const dog = normalizeDog(payload);
      const existing = await findExistingDog(supabase, dog.gingr_reservation_id, dog.gingr_animal_id);
      if (existing) {
        const newStatus = completionStatus(webhookType);
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const pendingHide = {
          ...existing,
          current_status: newStatus,
          completed_at: now
        };
        const checkoutCompletion = isCheckoutCompletion(webhookType);
        // Checkout completion must stay on the board until display_until — never hide immediately.
        const hideNow = checkoutCompletion ? false : shouldHideCompletedDog(pendingHide, nowDate);
        const displayUntil = checkoutCompletion
          ? resolveActiveCheckoutDisplayUntil(
              String(existing.status_started_at ?? now),
              existing.display_until,
              nowDate
            )
          : existing.display_until;
        const { error } = await supabase
          .from("live_transition_dogs")
          .update({
            current_status: newStatus,
            display_status: hideNow ? "removed" : checkoutCompletion ? "checking_out" : existing.display_status,
            hidden: hideNow,
            completed_at: now,
            display_until: displayUntil,
            last_seen_from_gingr_at: now,
            raw_payload: { ...payload, source: "gingr_webhook" },
            updated_at: now
          })
          .eq("id", existing.id);
        if (error) throw error;

        invalidateBoardTransitionCaches();

        await supabase.from("board_activity_log").insert({
          gingr_reservation_id: existing.gingr_reservation_id,
          animal_name: existing.animal_name,
          action: webhookType,
          previous_status: existing.current_status,
          new_status: newStatus,
          source: "webhook"
        });
      }
    }

    await supabase.from("gingr_webhook_events").update({ processed: true }).eq("id", event.id);
    return NextResponse.json({ ok: true, webhook_type: webhookType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await supabase
      .from("gingr_webhook_events")
      .update({ processed: false, processing_error: message })
      .eq("id", event.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
