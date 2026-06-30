import { NextResponse } from "next/server";
import { normalizeDog, verifyGingrSignature, type GingrWebhookPayload } from "@/lib/gingr";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const activeTypes = new Set(["checking_in", "checking_out"]);
const completionTypes = new Set(["check_in", "check_out"]);
const minimumVisibleMs = 3 * 60 * 1000;
const acceptedPassiveTypes = new Set([
  "animal_created",
  "animal_edited",
  "owner_created",
  "owner_edited",
  "incident_created",
  "incident_edited"
]);

function completionStatus(webhookType: string) {
  return webhookType === "check_in" ? "checked_in" : "checked_out";
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
  const verified = verifyGingrSignature(payload, process.env.GINGR_WEBHOOK_SIGNATURE_KEY);

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

  try {
    if (!activeTypes.has(webhookType) && !completionTypes.has(webhookType) && !acceptedPassiveTypes.has(webhookType)) {
      throw new Error(`Unsupported webhook_type: ${webhookType}`);
    }

    if (activeTypes.has(webhookType)) {
      const dog = normalizeDog(payload);
      const existing = await findExistingDog(supabase, dog.gingr_reservation_id, dog.gingr_animal_id);
      const now = new Date().toISOString();
      const row = {
        ...dog,
        current_status: webhookType,
        display_status: webhookType,
        hidden: false,
        status_started_at: now,
        completed_at: null,
        last_seen_from_gingr_at: now,
        raw_payload: payload,
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
        const statusStartedAt = existing.status_started_at ? new Date(existing.status_started_at) : nowDate;
        const visibleLongEnough = nowDate.getTime() - statusStartedAt.getTime() >= minimumVisibleMs;
        const { error } = await supabase
          .from("live_transition_dogs")
          .update({
            current_status: newStatus,
            display_status: visibleLongEnough ? "removed" : existing.display_status,
            hidden: visibleLongEnough,
            completed_at: now,
            last_seen_from_gingr_at: now,
            raw_payload: payload,
            updated_at: now
          })
          .eq("id", existing.id);
        if (error) throw error;

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
