import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import {
  etaMinutesFromCoords,
  fetchSamsaraVehicleLocations,
  isSamsaraLiveConfigured,
  matchVehicleByName
} from "@/lib/route-generator/samsara-live";
import {
  formatArriveAtLabel,
  OWNER_ETA_ALERT_MINUTES,
  OWNER_LIVE_MAP_MINUTES,
  ownerTrackHeadline,
  ownerTrackHelper,
  ownerTrackPhase,
  ownerTrackProgressStep,
  shouldSendEtaAlert,
  shouldShowLiveVehicle,
  type OwnerTrackPhase
} from "@/lib/route-generator/owner-track-thresholds";
import { phoneDigitsE164 } from "@/lib/route-generator/stop-notes";

function publicSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.RUFFLY_PUBLIC_URL?.trim() ||
    "https://staff.ruffops.com"
  ).replace(/\/$/, "");
}

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

export type OwnerTrackingPublicView = {
  token: string;
  status: string;
  direction: "pickup" | "dropoff";
  dogNames: string[];
  ownerName: string | null;
  stopAddress: string | null;
  stop: { lat: number; lng: number } | null;
  /** Only populated when ETA ≤ 10 minutes (privacy until then). */
  vehicle: { lat: number; lng: number; heading: number | null; updatedAt: string | null } | null;
  etaMinutes: number | null;
  arriveAtLabel: string | null;
  headline: string;
  subline: string;
  helperText: string;
  phase: OwnerTrackPhase;
  progressStep: number;
  showLiveVehicle: boolean;
  showArrivingBanner: boolean;
  liveConfigured: boolean;
  vanDisplayName: string;
  alertMinutes: number;
  liveMapMinutes: number;
};

export async function createOwnerTrackingForPlan(planId: string): Promise<{ created: number; smsQueued: number }> {
  const supabase = getServiceSupabase();
  const { data: plan } = await supabase.from("route_plans").select("*").eq("id", planId).single();
  if (!plan) throw new Error("Plan not found.");

  const { data: routes } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", planId)
    .eq("version_number", plan.current_version);

  const { data: vehicleRows } = await supabase
    .from("route_vehicle_configs")
    .select("van_key, samsara_vehicle_name, samsara_serial, display_name");
  const vehicleNameByKey = new Map(
    (vehicleRows ?? []).map((row) => [
      String(row.van_key),
      String(row.samsara_vehicle_name || row.display_name || row.van_key)
    ])
  );
  const vehicleSerialByKey = new Map(
    (vehicleRows ?? [])
      .filter((row) => row.samsara_serial)
      .map((row) => [String(row.van_key), String(row.samsara_serial)])
  );

  let created = 0;
  let smsQueued = 0;
  const sms = getSmsProvider();

  for (const route of routes ?? []) {
    const { data: stops } = await supabase
      .from("route_plan_stops")
      .select("*")
      .eq("route_id", route.id)
      .eq("stop_kind", "customer")
      .order("sequence");

    for (const stop of stops ?? []) {
      const { data: existing } = await supabase
        .from("route_owner_tracking")
        .select("id, token, link_sent_at, owner_phone_e164")
        .eq("stop_id", stop.id)
        .maybeSingle();

      const phone =
        phoneDigitsE164(stop.owner_phone_display) ||
        phoneDigitsE164(String(stop.driver_notes || "").match(/Phone:\s*([^\n]+)/i)?.[1]);

      const dogNames =
        String(stop.driver_notes || "")
          .split("\n")[0]
          ?.replace(/^\d+\s*dog\(s\):\s*/i, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];

      let token = existing?.token;
      if (!existing) {
        token = newToken();
        const { error } = await supabase.from("route_owner_tracking").insert({
          plan_id: planId,
          route_id: route.id,
          stop_id: stop.id,
          token,
          operating_date: String(plan.operating_date).slice(0, 10),
          direction: route.direction,
          van_key: route.van_key,
          samsara_vehicle_name: vehicleNameByKey.get(String(route.van_key)) || null,
          samsara_serial: vehicleSerialByKey.get(String(route.van_key)) || null,
          owner_name: stop.owner_name,
          dog_names: dogNames.length ? dogNames : [`${stop.dog_count || 1} dog(s)`],
          owner_phone_e164: phone,
          stop_address: stop.address,
          stop_latitude: stop.latitude,
          stop_longitude: stop.longitude,
          status: "pending"
        });
        if (error) throw new Error(error.message);
        created += 1;
      } else if (phone && !existing.owner_phone_e164) {
        await supabase.from("route_owner_tracking").update({ owner_phone_e164: phone }).eq("id", existing.id);
      }

      if (phone && sms.isConfigured() && !existing?.link_sent_at && token) {
        const url = `${publicSiteUrl()}/track/${token}`;
        const dogs = dogNames.slice(0, 3).join(" + ") || "your dog";
        const direction = route.direction === "pickup" ? "pickup" : "drop-off";
        const body = `Fitdog: track ${dogs}'s ${direction}. We'll text you ~${OWNER_ETA_ALERT_MINUTES} min out. Live van map unlocks at ~${OWNER_LIVE_MAP_MINUTES} min: ${url}`;
        const sent = await sms.send({
          to: phone,
          body,
          purpose: "transactional",
          idempotencyKey: `route-track-link:${stop.id}`
        });
        if (sent.ok) {
          await supabase
            .from("route_owner_tracking")
            .update({ link_sent_at: new Date().toISOString(), status: "en_route" })
            .eq("token", token);
          smsQueued += 1;
        }
      }
    }
  }

  return { created, smsQueued };
}

export async function getOwnerTrackingPublic(token: string): Promise<OwnerTrackingPublicView | null> {
  const supabase = getServiceSupabase();
  const { data: row } = await supabase.from("route_owner_tracking").select("*").eq("token", token).maybeSingle();
  if (!row) return null;

  let etaMinutes = row.last_eta_minutes == null ? null : Number(row.last_eta_minutes);
  let liveVehicle: OwnerTrackingPublicView["vehicle"] = null;

  // Refresh live location when Samsara is configured (best-effort on each poll).
  if (isSamsaraLiveConfigured() && row.stop_latitude != null && row.stop_longitude != null) {
    try {
      const vehicles = await fetchSamsaraVehicleLocations();
      const match = matchVehicleByName(vehicles, row.samsara_vehicle_name, row.samsara_serial);
      if (match) {
        etaMinutes = etaMinutesFromCoords(
          { lat: match.latitude, lng: match.longitude },
          { lat: Number(row.stop_latitude), lng: Number(row.stop_longitude) },
          match.speedMilesPerHour && match.speedMilesPerHour > 3 ? match.speedMilesPerHour : 18
        );
        liveVehicle = {
          lat: match.latitude,
          lng: match.longitude,
          heading: match.heading,
          updatedAt: match.time
        };
        const nextStatus =
          etaMinutes <= OWNER_ETA_ALERT_MINUTES
            ? "arriving_15"
            : row.status === "pending"
              ? "en_route"
              : row.status;
        await supabase
          .from("route_owner_tracking")
          .update({
            last_eta_minutes: etaMinutes,
            last_vehicle_latitude: match.latitude,
            last_vehicle_longitude: match.longitude,
            last_vehicle_at: match.time || new Date().toISOString(),
            status: nextStatus
          })
          .eq("id", row.id);
        row.status = nextStatus;
      }
    } catch {
      // Keep last known values.
    }
  }

  if (
    !liveVehicle &&
    row.last_vehicle_latitude != null &&
    row.last_vehicle_longitude != null &&
    Number.isFinite(Number(row.last_vehicle_latitude))
  ) {
    liveVehicle = {
      lat: Number(row.last_vehicle_latitude),
      lng: Number(row.last_vehicle_longitude),
      heading: null,
      updatedAt: row.last_vehicle_at ? String(row.last_vehicle_at) : null
    };
  }

  const status = String(row.status);
  const direction = row.direction as "pickup" | "dropoff";
  const phase = ownerTrackPhase({ status, etaMinutes });
  const showLive = shouldShowLiveVehicle(etaMinutes, status);
  const vanDisplayName = String(row.samsara_vehicle_name || row.van_key || "Fitdog van");

  return {
    token,
    status,
    direction,
    dogNames: (row.dog_names as string[]) || [],
    ownerName: row.owner_name,
    stopAddress: row.stop_address,
    stop:
      row.stop_latitude != null && row.stop_longitude != null
        ? { lat: Number(row.stop_latitude), lng: Number(row.stop_longitude) }
        : null,
    vehicle: showLive ? liveVehicle : null,
    etaMinutes,
    arriveAtLabel: formatArriveAtLabel(etaMinutes),
    headline: ownerTrackHeadline({ phase, direction, etaMinutes }),
    subline:
      etaMinutes != null && phase !== "arrived"
        ? `${etaMinutes} min away`
        : phase === "arrived"
          ? "Thanks for trusting Fitdog."
          : "Live updates when your route is moving",
    helperText: ownerTrackHelper({ phase, direction }),
    phase,
    progressStep: ownerTrackProgressStep(phase),
    showLiveVehicle: showLive,
    showArrivingBanner: phase === "nearby" || phase === "live",
    liveConfigured: isSamsaraLiveConfigured(),
    vanDisplayName,
    alertMinutes: OWNER_ETA_ALERT_MINUTES,
    liveMapMinutes: OWNER_LIVE_MAP_MINUTES
  };
}

/** Cron: refresh ETAs and SMS owners at ~15 minutes out. */
export async function processOwnerEtaAlerts(): Promise<{
  checked: number;
  sms15: number;
  arriving15: number;
  errors: string[];
}> {
  const supabase = getServiceSupabase();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const { data: rows } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("operating_date", today)
    .in("status", ["pending", "en_route", "arriving_15"]);

  const errors: string[] = [];
  let sms15 = 0;
  let arriving15 = 0;
  let vehicles: Awaited<ReturnType<typeof fetchSamsaraVehicleLocations>> = [];
  if (isSamsaraLiveConfigured()) {
    try {
      vehicles = await fetchSamsaraVehicleLocations();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Samsara location fetch failed");
    }
  }

  const sms = getSmsProvider();
  for (const row of rows ?? []) {
    if (row.stop_latitude == null || row.stop_longitude == null) continue;
    const match = matchVehicleByName(vehicles, row.samsara_vehicle_name, row.samsara_serial);
    if (!match) continue;

    const etaMinutes = etaMinutesFromCoords(
      { lat: match.latitude, lng: match.longitude },
      { lat: Number(row.stop_latitude), lng: Number(row.stop_longitude) },
      match.speedMilesPerHour && match.speedMilesPerHour > 3 ? match.speedMilesPerHour : 18
    );

    const patch: Record<string, unknown> = {
      last_eta_minutes: etaMinutes,
      last_vehicle_latitude: match.latitude,
      last_vehicle_longitude: match.longitude,
      last_vehicle_at: match.time || new Date().toISOString(),
      status: etaMinutes <= OWNER_ETA_ALERT_MINUTES ? "arriving_15" : "en_route"
    };

    if (shouldSendEtaAlert(etaMinutes, Boolean(row.notified_15_at))) {
      patch.notified_15_at = new Date().toISOString();
      arriving15 += 1;
      if (row.owner_phone_e164 && sms.isConfigured()) {
        const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
        const url = `${publicSiteUrl()}/track/${row.token}`;
        const sent = await sms.send({
          to: String(row.owner_phone_e164),
          body: `Fitdog: your driver is about ${etaMinutes} minutes away for ${dogs}. Live van map unlocks at ~${OWNER_LIVE_MAP_MINUTES} min: ${url}`,
          purpose: "transactional",
          idempotencyKey: `route-eta-15:${row.id}`
        });
        if (sent.ok) sms15 += 1;
        else if (sent.error) errors.push(`${row.token}: ${sent.error}`);
      }
    }

    await supabase.from("route_owner_tracking").update(patch).eq("id", row.id);
  }

  return { checked: rows?.length ?? 0, sms15, arriving15, errors };
}
