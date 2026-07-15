import { after } from "next/server";
import { NextResponse } from "next/server";
import { resolveActiveCheckinDisplayUntil, shouldExpireCheckinDog } from "@/lib/checkin-display";
import { resolveActiveCheckoutDisplayUntil, shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { invalidateBoardTransitionCaches } from "@/lib/board-settings-cache";
import { getGingrWebhookSignatureKey } from "@/lib/env";
import { normalizeDog, verifyGingrSignature, type GingrWebhookPayload } from "@/lib/gingr";
import { shellyCheckinAlertKey, shellyCheckoutAlertKey, triggerShellyAlert } from "@/lib/shelly-alert";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isContinuingSameTransition, shouldHideCompletedDog } from "@/lib/transition-cleanup";
import type { LiveDog } from "@/lib/types";

export const dynamic = "force-dynamic";

const activeTypes = new Set(["checking_in", "checking_out"]);
const completionTypes = new Set(["check_in", "check_out", "checked_in", "checked_out"]);
const acceptedPassiveTypes = new Set([
  "animal_created",
  "animal_edited",
  "owner_created",
  "owner_edited",
  "incident_created",
  "incident_edited"
]);

function completionStatus(webhookType: string) {
  if (webhookType === "check_in" || webhookType === "checked_in") return "checked_in";
  return "checked_out";
}

function isCheckoutCompletion(webhookType: string) {
  return webhookType === "check_out" || webhookType === "checked_out";
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
    if (!activeTypes.has(webhookType) && !completionTypes.has(webhookType) && !acceptedPassiveTypes.has(webhookType)) {
      throw new Error(`Unsupported webhook_type: ${webhookType}`);
    }

    if (activeTypes.has(webhookType)) {
      const dog = normalizeDog(payload);
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
        !windowExpired &&
        isContinuingSameTransition(existing, webhookType as "checking_in" | "checking_out");
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

      await supabase.from("board_activity_log").insert({
        gingr_reservation_id: dog.gingr_reservation_id,
        animal_name: dog.animal_name,
        action: webhookType,
        previous_status: existing?.current_status ?? null,
        new_status: webhookType,
        source: "webhook",
        details: { dog_id: savedDog.id }
      });

      if (!continuing) {
        after(async () => {
          if (webhookType === "checking_in") {
            await triggerShellyAlert("dog_check_in", shellyCheckinAlertKey(savedDog));
          } else if (webhookType === "checking_out") {
            await triggerShellyAlert("dog_check_out", shellyCheckoutAlertKey(savedDog));
          }
        });
      }

      invalidateBoardTransitionCaches();
    }

    if (acceptedPassiveTypes.has(webhookType)) {
      const dog = normalizeDog(payload);
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
        const hideNow = isCheckoutCompletion(webhookType) || shouldHideCompletedDog(pendingHide, nowDate);
        const { error } = await supabase
          .from("live_transition_dogs")
          .update({
            current_status: newStatus,
            display_status: hideNow ? "removed" : existing.display_status,
            hidden: hideNow,
            completed_at: now,
            last_seen_from_gingr_at: now,
            raw_payload: payload,
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
