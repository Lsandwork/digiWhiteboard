import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider, normalizeSmsToE164 } from "@/lib/integrations/sms/provider";
import {
  etaMinutesFromCoords,
  fetchSamsaraVehicleLocations,
  isSamsaraLiveConfigured,
  matchVehicleByName
} from "@/lib/route-generator/samsara-live";
import { getPublicSiteUrl } from "@/lib/site-url";

function publicSiteUrl(): string {
  // Owner tracking always lives on the Digi-Board host — never Ruffly's public URL.
  return getPublicSiteUrl().replace(/\/$/, "");
}

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Pull a usable owner phone from stop display fields / flattened driver notes. */
export function extractOwnerPhoneE164(...sources: Array<string | null | undefined>): string | null {
  for (const source of sources) {
    if (!source) continue;
    const text = String(source);
    const labeled = text.match(/Phone:\s*([^·\n|]+)/i)?.[1];
    const candidate = normalizeSmsToE164(labeled) || normalizeSmsToE164(text);
    if (candidate) return candidate;
  }
  return null;
}

export type OwnerTrackingPublicView = {
  token: string;
  status: string;
  direction: "pickup" | "dropoff";
  dogNames: string[];
  ownerName: string | null;
  stopAddress: string | null;
  stop: { lat: number; lng: number } | null;
  vehicle: { lat: number; lng: number; heading: number | null; updatedAt: string | null } | null;
  etaMinutes: number | null;
  headline: string;
  subline: string;
  showArrivingBanner: boolean;
  liveConfigured: boolean;
};

function headlineFor(status: string, etaMinutes: number | null, direction: string): string {
  if (status === "arrived" || status === "completed") {
    return direction === "pickup" ? "Your Fitdog driver has arrived" : "Your dog is being dropped off";
  }
  if (etaMinutes != null && etaMinutes <= 15) {
    return `${etaMinutes} min away`;
  }
  if (etaMinutes != null) {
    return `${etaMinutes} min away`;
  }
  return direction === "pickup" ? "Driver is on the way" : "Drop-off is on the way";
}

function sublineFor(status: string, etaMinutes: number | null): string {
  if (status === "arrived" || status === "completed") return "Thanks for trusting Fitdog.";
  if (etaMinutes != null && etaMinutes <= 15) return "Your driver is almost there — please be ready.";
  if (etaMinutes != null && etaMinutes <= 30) return "Your driver is getting close.";
  return "Live map updates as your Fitdog van moves.";
}

/** Tokens used in SMS samples / Twilio verification — not real owner links. */
const DEMO_TRACK_TOKENS = new Set(["example", "demo"]);

/** Simulated trip length shown to the owner (minutes). */
const DEMO_SIM_ETA_MINUTES = 12;
/**
 * Demo-only speed-up. Real Samsara owner links are unaffected.
 * 12 sim-minutes at 3× ≈ 4 real minutes to arrival.
 */
const DEMO_SPEED_FACTOR = 3;

/** Venice stop — demo destination. */
const DEMO_STOP = { lat: 33.9915, lng: -118.4662 };

/**
 * Short approach into Venice (closer than Culver) so the van looks almost there.
 * Progress is time-warped with traffic / light pauses — not a straight lerp.
 */
const DEMO_ROUTE: Array<{ lat: number; lng: number }> = [
  { lat: 33.9990, lng: -118.4538 }, // start — closer to Venice
  { lat: 33.9974, lng: -118.4572 },
  { lat: 33.9960, lng: -118.4596 }, // light / slow
  { lat: 33.9946, lng: -118.4618 },
  { lat: 33.9934, lng: -118.4636 }, // light / slow
  { lat: 33.9924, lng: -118.4650 },
  DEMO_STOP
];

/**
 * Time-share segments: each row is { timeFrac of trip, progressFrac along route }.
 * Lights / traffic burn time with little movement.
 */
const DEMO_DRIVE_SEGMENTS: Array<{ timeFrac: number; progressFrac: number }> = [
  { timeFrac: 0.16, progressFrac: 0.2 },
  { timeFrac: 0.08, progressFrac: 0.015 }, // red light
  { timeFrac: 0.18, progressFrac: 0.22 },
  { timeFrac: 0.1, progressFrac: 0.04 }, // traffic crawl
  { timeFrac: 0.07, progressFrac: 0.012 }, // light
  { timeFrac: 0.17, progressFrac: 0.24 },
  { timeFrac: 0.08, progressFrac: 0.03 }, // light
  { timeFrac: 0.16, progressFrac: 0.243 }
];

export function isOwnerTrackingDemoToken(token: string): boolean {
  return DEMO_TRACK_TOKENS.has(token.trim().toLowerCase());
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function headingDegrees(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Map sim-time fraction → route progress with traffic/light pauses. */
function demoRouteProgressFromTime(timeFrac: number): number {
  const t = clamp01(timeFrac);
  let timeAcc = 0;
  let progressAcc = 0;
  for (const segment of DEMO_DRIVE_SEGMENTS) {
    const nextTime = timeAcc + segment.timeFrac;
    if (t <= nextTime + 1e-9) {
      const local = segment.timeFrac <= 0 ? 1 : (t - timeAcc) / segment.timeFrac;
      return clamp01(progressAcc + segment.progressFrac * clamp01(local));
    }
    timeAcc = nextTime;
    progressAcc += segment.progressFrac;
  }
  return 1;
}

function demoPointAlongRoute(progress: number): {
  lat: number;
  lng: number;
  heading: number;
} {
  const p = clamp01(progress);
  if (p <= 0) {
    const a = DEMO_ROUTE[0]!;
    const b = DEMO_ROUTE[1] || a;
    return { lat: a.lat, lng: a.lng, heading: headingDegrees(a, b) };
  }
  if (p >= 1) {
    const last = DEMO_ROUTE[DEMO_ROUTE.length - 1]!;
    const prev = DEMO_ROUTE[DEMO_ROUTE.length - 2] || last;
    return { lat: last.lat, lng: last.lng, heading: headingDegrees(prev, last) };
  }

  const segments = DEMO_ROUTE.length - 1;
  const scaled = p * segments;
  const idx = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - idx;
  const a = DEMO_ROUTE[idx]!;
  const b = DEMO_ROUTE[idx + 1]!;
  return {
    lat: lerp(a.lat, b.lat, local),
    lng: lerp(a.lng, b.lng, local),
    heading: headingDegrees(a, b)
  };
}

/**
 * Demo-only clock: advances at DEMO_SPEED_FACTOR.
 * Pass `startedAtMs` (from SMS link `?t=`) so the trip starts ~12 min away.
 * Without a start time, the demo loops on a wall-clock cycle so `/track/example` always moves.
 */
export function getDemoDriveState(nowMs = Date.now(), startedAtMs?: number | null) {
  const simTripMs = DEMO_SIM_ETA_MINUTES * 60 * 1000;
  const realTripMs = Math.round(simTripMs / DEMO_SPEED_FACTOR);
  const holdAtArrivalMs = 45_000;
  const cycleMs = realTripMs + holdAtArrivalMs;

  let elapsedRealMs: number;
  if (startedAtMs != null && Number.isFinite(startedAtMs) && startedAtMs > 0) {
    elapsedRealMs = Math.max(0, nowMs - startedAtMs);
  } else {
    elapsedRealMs = nowMs % cycleMs;
  }

  const simElapsedMs = Math.min(simTripMs, elapsedRealMs * DEMO_SPEED_FACTOR);
  const timeFrac = clamp01(simElapsedMs / simTripMs);
  const routeProgress = demoRouteProgressFromTime(timeFrac);
  const point = demoPointAlongRoute(routeProgress);
  const remainingSimMs = Math.max(0, simTripMs - simElapsedMs);
  const etaMinutes =
    remainingSimMs <= 0 ? 0 : Math.max(1, Math.ceil(remainingSimMs / 60_000));
  const arrived = remainingSimMs <= 0 || routeProgress >= 0.995;

  return {
    stop: DEMO_STOP,
    vehicle: {
      lat: point.lat,
      lng: point.lng,
      heading: Math.round(((point.heading % 360) + 360) % 360),
      updatedAt: new Date(nowMs).toISOString()
    },
    etaMinutes: arrived ? 0 : etaMinutes,
    arrived,
    routeProgress,
    speedFactor: DEMO_SPEED_FACTOR
  };
}

/** Preview payload so `/track/example` opens a live-feeling demo map (not Samsara). */
export function getOwnerTrackingDemo(
  token: string,
  options?: { startedAtMs?: number | null; nowMs?: number }
): OwnerTrackingPublicView {
  const normalized = token.trim().toLowerCase();
  const drive = getDemoDriveState(options?.nowMs ?? Date.now(), options?.startedAtMs);
  const direction = "pickup" as const;
  const status = drive.arrived ? "arrived" : drive.etaMinutes <= 15 ? "arriving_15" : "en_route";
  const etaMinutes = drive.arrived ? 0 : drive.etaMinutes;
  return {
    token: normalized,
    status,
    direction,
    dogNames: ["Indy"],
    ownerName: "Demo Owner",
    stopAddress: "Venice, Los Angeles, CA",
    stop: drive.stop,
    vehicle: drive.vehicle,
    etaMinutes,
    headline: headlineFor(status, etaMinutes, direction),
    subline: sublineFor(status, etaMinutes),
    showArrivingBanner: Boolean(etaMinutes != null && etaMinutes <= 15) || status === "arriving_15" || drive.arrived,
    liveConfigured: true
  };
}

export async function createOwnerTrackingForPlan(planId: string): Promise<{
  created: number;
  smsQueued: number;
  smsConfigured: boolean;
  smsErrors: string[];
}> {
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
  const smsErrors: string[] = [];
  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    smsErrors.push(
      "Twilio is not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)."
    );
  }

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

      const phone = extractOwnerPhoneE164(
        stop.owner_phone_display,
        stop.driver_notes,
        String(stop.driver_notes || "").match(/Phone:\s*([^·\n|]+)/i)?.[1]
      );

      const dogNames = String(stop.driver_notes || "")
        .split(/\n|·/)[0]
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

      if (!phone) {
        smsErrors.push(`Stop ${stop.owner_name || stop.id}: missing owner phone`);
        continue;
      }

      if (sms.isConfigured() && !existing?.link_sent_at && token) {
        const url = `${publicSiteUrl()}/track/${token}`;
        const dogs = dogNames.slice(0, 3).join(" + ") || "your dog";
        const direction = route.direction === "pickup" ? "pickup" : "drop-off";
        const body = `Fitdog: track ${dogs}'s ${direction} live — ${url}`;
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
        } else {
          smsErrors.push(`${phone}: ${sent.error || "Twilio send failed"}`);
        }
      }
    }
  }

  return { created, smsQueued, smsConfigured: sms.isConfigured(), smsErrors: smsErrors.slice(0, 25) };
}

export async function getOwnerTrackingPublic(
  token: string,
  options?: { startedAtMs?: number | null }
): Promise<OwnerTrackingPublicView | null> {
  if (isOwnerTrackingDemoToken(token)) {
    return getOwnerTrackingDemo(token, { startedAtMs: options?.startedAtMs });
  }

  const supabase = getServiceSupabase();
  const { data: row } = await supabase.from("route_owner_tracking").select("*").eq("token", token).maybeSingle();
  if (!row) return null;

  let etaMinutes = row.last_eta_minutes == null ? null : Number(row.last_eta_minutes);
  let vehicle: OwnerTrackingPublicView["vehicle"] = null;

  if (
    row.last_vehicle_latitude != null &&
    row.last_vehicle_longitude != null &&
    Number.isFinite(Number(row.last_vehicle_latitude))
  ) {
    vehicle = {
      lat: Number(row.last_vehicle_latitude),
      lng: Number(row.last_vehicle_longitude),
      heading: null,
      updatedAt: row.last_vehicle_at ? String(row.last_vehicle_at) : null
    };
  }

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
        vehicle = {
          lat: match.latitude,
          lng: match.longitude,
          heading: match.heading,
          updatedAt: match.time
        };
        const nextStatus =
          etaMinutes <= 15 ? "arriving_15" : etaMinutes <= 30 ? "en_route" : row.status === "pending" ? "en_route" : row.status;
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

  const status = String(row.status);
  return {
    token,
    status,
    direction: row.direction as "pickup" | "dropoff",
    dogNames: (row.dog_names as string[]) || [],
    ownerName: row.owner_name,
    stopAddress: row.stop_address,
    stop:
      row.stop_latitude != null && row.stop_longitude != null
        ? { lat: Number(row.stop_latitude), lng: Number(row.stop_longitude) }
        : null,
    vehicle,
    etaMinutes,
    headline: headlineFor(status, etaMinutes, String(row.direction)),
    subline: sublineFor(status, etaMinutes),
    showArrivingBanner: Boolean(etaMinutes != null && etaMinutes <= 15) || status === "arriving_15",
    liveConfigured: isSamsaraLiveConfigured()
  };
}

/** Cron: refresh ETAs and send 30-min SMS + record 15-min state. */
export async function processOwnerEtaAlerts(): Promise<{
  checked: number;
  sms30: number;
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
  let sms30 = 0;
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
      status: etaMinutes <= 15 ? "arriving_15" : "en_route"
    };

    if (etaMinutes <= 30 && !row.notified_30_at && row.owner_phone_e164 && sms.isConfigured()) {
      const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
      const url = `${publicSiteUrl()}/track/${row.token}`;
      const body = `Fitdog: your driver is about ${etaMinutes} minutes away for ${dogs}. Track live: ${url}`;
      const sent = await sms.send({
        to: String(row.owner_phone_e164),
        body,
        purpose: "transactional",
        idempotencyKey: `route-eta-30:${row.id}`
      });
      if (sent.ok) {
        patch.notified_30_at = new Date().toISOString();
        sms30 += 1;
      } else if (sent.error) {
        errors.push(`${row.token}: ${sent.error}`);
      }
    }

    if (etaMinutes <= 15 && !row.notified_15_at) {
      patch.notified_15_at = new Date().toISOString();
      arriving15 += 1;
      // Optional SMS at 15 as well when Twilio is configured.
      if (row.owner_phone_e164 && sms.isConfigured()) {
        const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
        const url = `${publicSiteUrl()}/track/${row.token}`;
        await sms.send({
          to: String(row.owner_phone_e164),
          body: `Fitdog: your driver is ~${etaMinutes} minutes out for ${dogs}. Live map: ${url}`,
          purpose: "transactional",
          idempotencyKey: `route-eta-15:${row.id}`
        });
      }
    }

    await supabase.from("route_owner_tracking").update(patch).eq("id", row.id);
  }

  return { checked: rows?.length ?? 0, sms30, arriving15, errors };
}
