/**
 * Opt-in Gingr home-pickup live tracking + SMS.
 *
 * Staff must check the Gingr Route Generator box. Export without that box
 * never creates tracking and never texts owners.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { isFitdogVanKey, type FitdogVanKey } from "@/lib/route-generator/flags";
import { createOwnerTrackingForPlan } from "@/lib/route-generator/owner-tracking";
import {
  vanKeyFromSamsaraVehicleName,
  type GingrPickupTrackingStop
} from "@/lib/gingr-route-generator/samsara-export";

export { parseGingrSendOwnerSmsParam } from "@/lib/gingr-route-generator/sms-opt-in";

const PLAN_SOURCE = "gingr_route_generator";

const VAN_COLORS: Record<FitdogVanKey, string> = {
  van_1: "#f15f2a",
  van_2: "#0ea5e9",
  van_3: "#22c55e",
  van_5: "#a855f7",
  van_6: "#eab308"
};

export type GingrPickupTrackingResult =
  | {
      attempted: false;
      reason: "opt_out" | "no_pickups";
      created: 0;
      smsQueued: 0;
      smsEnabled: false;
      smsErrors: string[];
    }
  | {
      attempted: true;
      planId: string;
      created: number;
      smsQueued: number;
      smsEnabled: boolean;
      smsConfigured: boolean;
      smsDeferredQuietHours: boolean;
      smsBlockedByKillSwitch: boolean;
      smsErrors: string[];
    };

async function findOrCreateGingrPlan(params: {
  date: string;
  vehicleName: string;
  actorEmail: string | null;
}) {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("route_plans")
    .select("id, current_version, summary")
    .eq("operating_date", params.date)
    .order("created_at", { ascending: false })
    .limit(20);

  const match = (existing ?? []).find((row) => {
    const summary = (row.summary || {}) as Record<string, unknown>;
    return summary.source === PLAN_SOURCE;
  });
  if (match) {
    await supabase
      .from("route_plans")
      .update({
        status: "exported",
        summary: {
          ...((match.summary || {}) as Record<string, unknown>),
          source: PLAN_SOURCE,
          vehicleName: params.vehicleName
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", match.id);
    return { id: String(match.id), current_version: Number(match.current_version || 1) };
  }

  const { data: inserted, error } = await supabase
    .from("route_plans")
    .insert({
      operating_date: params.date,
      status: "exported",
      current_version: 1,
      shadow_mode: true,
      summary: { source: PLAN_SOURCE, vehicleName: params.vehicleName },
      created_by_email: params.actorEmail
    })
    .select("id, current_version")
    .single();
  if (error || !inserted) throw new Error(error?.message || "Unable to create Gingr tracking plan.");
  return { id: String(inserted.id), current_version: Number(inserted.current_version || 1) };
}

async function ensurePickupRoute(params: {
  planId: string;
  versionNumber: number;
  vanKey: FitdogVanKey;
}) {
  const supabase = getServiceSupabase();
  const vehiclePool: "club" | "outing" = params.vanKey === "van_5" || params.vanKey === "van_6" ? "club" : "outing";
  const { data: existing } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", params.planId)
    .eq("version_number", params.versionNumber)
    .eq("van_key", params.vanKey)
    .eq("direction", "pickup")
    .maybeSingle();
  if (existing) return existing;

  const { data: route, error } = await supabase
    .from("route_plan_routes")
    .insert({
      plan_id: params.planId,
      version_number: params.versionNumber,
      van_key: params.vanKey,
      vehicle_pool: vehiclePool,
      direction: "pickup",
      wave_name: "Morning Pickup",
      status: "exported",
      total_stops: 0,
      total_dogs: 0,
      capacity_used: 0,
      load_units_used: 0,
      large_dogs: 0,
      map_color: VAN_COLORS[params.vanKey]
    })
    .select("*")
    .single();
  if (error || !route) throw new Error(error?.message || "Unable to create Gingr pickup route.");
  return route;
}

function stopNotes(stop: GingrPickupTrackingStop): string {
  const lines = [stop.dogName];
  if (stop.ownerPhone) lines.push(`Phone: ${stop.ownerPhone}`);
  if (stop.notes) lines.push(stop.notes);
  return lines.join("\n");
}

async function upsertPickupStops(params: {
  routeId: string;
  stops: GingrPickupTrackingStop[];
}) {
  const supabase = getServiceSupabase();
  const { data: existingStops } = await supabase
    .from("route_plan_stops")
    .select("id, household_key, sequence")
    .eq("route_id", params.routeId)
    .eq("stop_kind", "customer");

  const byHousehold = new Map(
    (existingStops ?? []).map((row) => [String(row.household_key || ""), row])
  );
  const keepKeys = new Set(params.stops.map((stop) => `gingr:${stop.dogId}`));

  for (const row of existingStops ?? []) {
    const nextSequence = 10000 + Number(row.sequence || 0);
    await supabase.from("route_plan_stops").update({ sequence: nextSequence }).eq("id", row.id);
  }

  for (const stop of params.stops) {
    const householdKey = `gingr:${stop.dogId}`;
    const payload = {
      route_id: params.routeId,
      sequence: stop.sequence,
      stop_kind: "customer" as const,
      owner_name: stop.ownerName,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      dog_count: 1,
      load_units: 1,
      owner_phone_display: stop.ownerPhone,
      driver_notes: stopNotes(stop),
      household_key: householdKey,
      validation_status: "ok"
    };
    const existing = byHousehold.get(householdKey);
    if (existing) {
      await supabase.from("route_plan_stops").update(payload).eq("id", existing.id);
    } else {
      const { error } = await supabase.from("route_plan_stops").insert(payload);
      if (error) throw new Error(error.message);
    }
  }

  for (const row of existingStops ?? []) {
    const key = String(row.household_key || "");
    if (!keepKeys.has(key)) {
      await supabase.from("route_plan_stops").delete().eq("id", row.id);
    }
  }

  await supabase
    .from("route_plan_routes")
    .update({
      total_stops: params.stops.length,
      total_dogs: params.stops.length,
      capacity_used: params.stops.length,
      status: "exported"
    })
    .eq("id", params.routeId);
}

export async function persistGingrPickupOwnerTracking(params: {
  date: string;
  vehicleName: string;
  stops: GingrPickupTrackingStop[];
  sendSms: boolean;
  actorEmail?: string | null;
}): Promise<GingrPickupTrackingResult> {
  if (!params.sendSms) {
    return {
      attempted: false,
      reason: "opt_out",
      created: 0,
      smsQueued: 0,
      smsEnabled: false,
      smsErrors: []
    };
  }
  if (!params.stops.length) {
    return {
      attempted: false,
      reason: "no_pickups",
      created: 0,
      smsQueued: 0,
      smsEnabled: false,
      smsErrors: []
    };
  }

  const vanKey = vanKeyFromSamsaraVehicleName(params.vehicleName);
  if (!isFitdogVanKey(vanKey)) {
    throw new Error(`Unsupported van for owner tracking: ${params.vehicleName}`);
  }

  const plan = await findOrCreateGingrPlan({
    date: params.date,
    vehicleName: params.vehicleName,
    actorEmail: params.actorEmail ?? null
  });
  const route = await ensurePickupRoute({
    planId: plan.id,
    versionNumber: plan.current_version,
    vanKey
  });
  await upsertPickupStops({ routeId: String(route.id), stops: params.stops });

  const tracking = await createOwnerTrackingForPlan(plan.id, { sendSms: true });

  const supabase = getServiceSupabase();
  await supabase
    .from("route_owner_tracking")
    .update({ samsara_vehicle_name: params.vehicleName })
    .eq("plan_id", plan.id)
    .eq("van_key", vanKey)
    .eq("direction", "pickup");

  return {
    attempted: true,
    planId: plan.id,
    created: tracking.created,
    smsQueued: tracking.smsQueued,
    smsEnabled: tracking.smsEnabled,
    smsConfigured: tracking.smsConfigured,
    smsDeferredQuietHours: tracking.smsDeferredQuietHours,
    smsBlockedByKillSwitch: tracking.smsBlockedByKillSwitch,
    smsErrors: tracking.smsErrors
  };
}
