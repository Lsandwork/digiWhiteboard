import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider, normalizeSmsToE164 } from "@/lib/integrations/sms/provider";
import {
  buildRouteEta15Sms,
  buildRouteEta30Sms,
  buildRoutePullupSms,
  buildRouteTrackingLinkSms
} from "@/lib/integrations/sms/templates";
import {
  etaMinutesFromCoords,
  fetchSamsaraVehicleLocations,
  isSamsaraLiveConfigured,
  matchVehicleByName
} from "@/lib/route-generator/samsara-live";
import { getPublicSiteUrl } from "@/lib/site-url";
import {
  evaluateOwnerEtaSmsGate,
  isWithinRouteOwnerSmsServiceHours,
  routeOwnerSmsQuietHoursMessage,
  ROUTE_OWNER_SMS_MIN_SPEED_MPH
} from "@/lib/route-generator/sms-policy";
import { recordOwnerSmsEvent } from "@/lib/route-generator/owner-tracking-admin";
import { isRouteOwnerSmsEnabled } from "@/lib/route-generator/flags";

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

function headlineFor(
  status: string,
  etaMinutes: number | null,
  direction: string,
  routeProgress?: number | null
): string {
  if (status === "arrived" || status === "completed") {
    return direction === "pickup" ? "Your Fitdog driver has arrived" : "Your dog is being dropped off";
  }
  if (
    (etaMinutes != null && etaMinutes <= 2) ||
    (routeProgress != null && routeProgress >= 0.92)
  ) {
    return "Driver is pulling up now";
  }
  if (etaMinutes != null && etaMinutes <= 5) {
    return `${etaMinutes} min away — almost there`;
  }
  if (etaMinutes != null && etaMinutes <= 15) {
    return `${etaMinutes} min away`;
  }
  if (etaMinutes != null) {
    return `${etaMinutes} min away`;
  }
  return direction === "pickup" ? "Driver is on the way" : "Drop-off is on the way";
}

function sublineFor(status: string, etaMinutes: number | null, routeProgress?: number | null): string {
  if (status === "arrived" || status === "completed") return "Thanks for trusting Fitdog.";
  if ((etaMinutes != null && etaMinutes <= 2) || (routeProgress != null && routeProgress >= 0.92)) {
    return "Your Fitdog van is pulling up to the stop — please be ready.";
  }
  if (etaMinutes != null && etaMinutes <= 15) return "Your driver is almost there — please be ready.";
  if (etaMinutes != null && etaMinutes <= 30) return "Your driver is getting close.";
  return "Live map updates as your Fitdog van moves.";
}

type DemoScenario = {
  token: string;
  dogNames: string[];
  ownerName: string;
  stopAddress: string;
  stop: { lat: number; lng: number };
  route: Array<{ lat: number; lng: number }>;
  simEtaMinutes: number;
  speedFactor: number;
};

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

/** Venice stop — legacy Indy demo. */
const DEMO_STOP_VENICE = { lat: 33.9915, lng: -118.4662 };

/** Jasper pickup — 7742 Redlands St, Playa Del Rey, CA 90293 */
const DEMO_STOP_JASPER = { lat: 33.95315, lng: -118.43955 };

/**
 * Lincoln Blvd & Manchester Ave → Redlands St (Playa Del Rey).
 * Short approach with light/traffic pauses so the map feels real-time.
 */
const DEMO_ROUTE_JASPER: Array<{ lat: number; lng: number }> = [
  { lat: 33.96005, lng: -118.41815 }, // Lincoln & Manchester — driver start
  { lat: 33.95955, lng: -118.4224 },
  { lat: 33.9587, lng: -118.4268 }, // light / slow
  { lat: 33.9574, lng: -118.4312 },
  { lat: 33.9559, lng: -118.4349 }, // traffic crawl
  { lat: 33.9546, lng: -118.4376 },
  { lat: 33.9537, lng: -118.4389 }, // final approach / pulling up
  DEMO_STOP_JASPER
];

const DEMO_ROUTE_VENICE: Array<{ lat: number; lng: number }> = [
  { lat: 33.9990, lng: -118.4538 },
  { lat: 33.9974, lng: -118.4572 },
  { lat: 33.9960, lng: -118.4596 },
  { lat: 33.9946, lng: -118.4618 },
  { lat: 33.9934, lng: -118.4636 },
  { lat: 33.9924, lng: -118.4650 },
  DEMO_STOP_VENICE
];

const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  example: {
    token: "example",
    dogNames: ["Indy"],
    ownerName: "Demo Owner",
    stopAddress: "Venice, Los Angeles, CA",
    stop: DEMO_STOP_VENICE,
    route: DEMO_ROUTE_VENICE,
    simEtaMinutes: 12,
    speedFactor: 3
  },
  demo: {
    token: "demo",
    dogNames: ["Indy"],
    ownerName: "Demo Owner",
    stopAddress: "Venice, Los Angeles, CA",
    stop: DEMO_STOP_VENICE,
    route: DEMO_ROUTE_VENICE,
    simEtaMinutes: 12,
    speedFactor: 3
  },
  jasper: {
    token: "jasper",
    dogNames: ["Jasper"],
    ownerName: "Demo Owner",
    stopAddress: "7742 Redlands St, Playa Del Rey, CA 90293",
    stop: DEMO_STOP_JASPER,
    route: DEMO_ROUTE_JASPER,
    // ~10 sim minutes at 3× ≈ 3.3 real minutes — tight demo for “pulling up” SMS.
    simEtaMinutes: 10,
    speedFactor: 3
  }
};

export function isOwnerTrackingDemoToken(token: string): boolean {
  return Boolean(DEMO_SCENARIOS[token.trim().toLowerCase()]);
}

export function getDemoScenario(token: string): DemoScenario | null {
  return DEMO_SCENARIOS[token.trim().toLowerCase()] ?? null;
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

function demoPointAlongRoute(
  progress: number,
  route: Array<{ lat: number; lng: number }>
): {
  lat: number;
  lng: number;
  heading: number;
} {
  const p = clamp01(progress);
  if (p <= 0) {
    const a = route[0]!;
    const b = route[1] || a;
    return { lat: a.lat, lng: a.lng, heading: headingDegrees(a, b) };
  }
  if (p >= 1) {
    const last = route[route.length - 1]!;
    const prev = route[route.length - 2] || last;
    return { lat: last.lat, lng: last.lng, heading: headingDegrees(prev, last) };
  }

  const segments = route.length - 1;
  const scaled = p * segments;
  const idx = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - idx;
  const a = route[idx]!;
  const b = route[idx + 1]!;
  return {
    lat: lerp(a.lat, b.lat, local),
    lng: lerp(a.lng, b.lng, local),
    heading: headingDegrees(a, b)
  };
}

/**
 * Demo-only clock: advances at scenario speedFactor.
 * Pass `startedAtMs` (from SMS link `?t=`) so the trip starts at full ETA.
 * Without a start time, the demo loops on a wall-clock cycle so `/track/example` always moves.
 */
export function getDemoDriveState(
  nowMs = Date.now(),
  startedAtMs?: number | null,
  tokenOrScenario: string | DemoScenario = "example"
) {
  const scenario =
    typeof tokenOrScenario === "string"
      ? getDemoScenario(tokenOrScenario) || DEMO_SCENARIOS.example!
      : tokenOrScenario;
  const simTripMs = scenario.simEtaMinutes * 60 * 1000;
  const realTripMs = Math.round(simTripMs / scenario.speedFactor);
  const holdAtArrivalMs = 45_000;
  const cycleMs = realTripMs + holdAtArrivalMs;

  let elapsedRealMs: number;
  if (startedAtMs != null && Number.isFinite(startedAtMs) && startedAtMs > 0) {
    elapsedRealMs = Math.max(0, nowMs - startedAtMs);
  } else {
    elapsedRealMs = nowMs % cycleMs;
  }

  const simElapsedMs = Math.min(simTripMs, elapsedRealMs * scenario.speedFactor);
  const timeFrac = clamp01(simElapsedMs / simTripMs);
  const routeProgress = demoRouteProgressFromTime(timeFrac);
  const point = demoPointAlongRoute(routeProgress, scenario.route);
  const remainingSimMs = Math.max(0, simTripMs - simElapsedMs);
  const etaMinutes =
    remainingSimMs <= 0 ? 0 : Math.max(1, Math.ceil(remainingSimMs / 60_000));
  const arrived = remainingSimMs <= 0 || routeProgress >= 0.995;

  return {
    stop: scenario.stop,
    vehicle: {
      lat: point.lat,
      lng: point.lng,
      heading: Math.round(((point.heading % 360) + 360) % 360),
      updatedAt: new Date(nowMs).toISOString()
    },
    etaMinutes: arrived ? 0 : etaMinutes,
    arrived,
    routeProgress,
    speedFactor: scenario.speedFactor,
    scenario
  };
}

/** Preview payload so `/track/jasper` (or `/track/example`) opens a live-feeling demo map. */
export function getOwnerTrackingDemo(
  token: string,
  options?: { startedAtMs?: number | null; nowMs?: number }
): OwnerTrackingPublicView {
  const normalized = token.trim().toLowerCase();
  const scenario = getDemoScenario(normalized) || DEMO_SCENARIOS.example!;
  const drive = getDemoDriveState(options?.nowMs ?? Date.now(), options?.startedAtMs, scenario);
  const direction = "pickup" as const;
  const status = drive.arrived
    ? "arrived"
    : drive.etaMinutes <= 2 || drive.routeProgress >= 0.92
      ? "pulling_up"
      : drive.etaMinutes <= 15
        ? "arriving_15"
        : "en_route";
  const etaMinutes = drive.arrived ? 0 : drive.etaMinutes;
  return {
    token: normalized,
    status,
    direction,
    dogNames: scenario.dogNames,
    ownerName: scenario.ownerName,
    stopAddress: scenario.stopAddress,
    stop: drive.stop,
    vehicle: drive.vehicle,
    etaMinutes,
    headline: headlineFor(status, etaMinutes, direction, drive.routeProgress),
    subline: sublineFor(status, etaMinutes, drive.routeProgress),
    showArrivingBanner:
      Boolean(etaMinutes != null && etaMinutes <= 15) ||
      status === "arriving_15" ||
      status === "pulling_up" ||
      drive.arrived,
    liveConfigured: true
  };
}

export type CreateOwnerTrackingOptions = {
  /** Explicit staff opt-in. Default false — generating/approving routes must never text owners. */
  sendSms?: boolean;
  now?: Date;
};

export async function createOwnerTrackingForPlan(
  planId: string,
  options: CreateOwnerTrackingOptions = {}
): Promise<{
  created: number;
  smsQueued: number;
  smsConfigured: boolean;
  smsEnabled: boolean;
  smsDeferredQuietHours: boolean;
  smsBlockedByKillSwitch: boolean;
  smsErrors: string[];
}> {
  const ownerSmsAllowed = isRouteOwnerSmsEnabled();
  const sendSmsRequested = Boolean(options.sendSms) && ownerSmsAllowed;
  const now = options.now ?? new Date();
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
  const quietHoursMessage = routeOwnerSmsQuietHoursMessage(now);
  const canSendLinkNow = sendSmsRequested && !quietHoursMessage;
  if (options.sendSms && !ownerSmsAllowed) {
    smsErrors.push(
      "Owner SMS is disabled (ROUTE_OWNER_SMS_ENABLED is off). Tracking links were created without texting anyone."
    );
  }
  if (sendSmsRequested && !sms.isConfigured()) {
    smsErrors.push(
      "Twilio is not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)."
    );
  }
  if (sendSmsRequested && quietHoursMessage) {
    smsErrors.push(quietHoursMessage);
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
        .select("id, token, link_sent_at, owner_phone_e164, sms_alerts_enabled")
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

      const plannedArrivalAt = stop.eta_arrival ? String(stop.eta_arrival) : null;
      const plannedWindowStart = stop.requested_window_start ? String(stop.requested_window_start) : null;
      const plannedWindowEnd = stop.requested_window_end ? String(stop.requested_window_end) : null;

      let token = existing?.token;
      let trackingId = existing?.id ? String(existing.id) : null;
      if (!existing) {
        token = newToken();
        const { data: inserted, error } = await supabase
          .from("route_owner_tracking")
          .insert({
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
            planned_arrival_at: plannedArrivalAt,
            planned_window_start: plannedWindowStart,
            planned_window_end: plannedWindowEnd,
            // Only staff checkbox enables owner SMS. Approve alone never texts.
            sms_alerts_enabled: sendSmsRequested,
            status: "pending"
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        trackingId = inserted?.id ? String(inserted.id) : null;
        created += 1;
      } else {
        const patch: Record<string, unknown> = {
          planned_arrival_at: plannedArrivalAt,
          planned_window_start: plannedWindowStart,
          planned_window_end: plannedWindowEnd,
          samsara_vehicle_name: vehicleNameByKey.get(String(route.van_key)) || null,
          samsara_serial: vehicleSerialByKey.get(String(route.van_key)) || null
        };
        if (phone && !existing.owner_phone_e164) patch.owner_phone_e164 = phone;
        if (sendSmsRequested) patch.sms_alerts_enabled = true;
        await supabase.from("route_owner_tracking").update(patch).eq("id", existing.id);
      }

      if (!phone) {
        if (sendSmsRequested) smsErrors.push(`Stop ${stop.owner_name || stop.id}: missing owner phone`);
        continue;
      }

      if (canSendLinkNow && sms.isConfigured() && !existing?.link_sent_at && token) {
        const url = `${publicSiteUrl()}/track/${token}`;
        const dogs = dogNames.slice(0, 3).join(" + ") || "your dog";
        const direction = route.direction === "pickup" ? "pickup" : "drop-off";
        const body = buildRouteTrackingLinkSms({ dogs, direction, url });
        const sent = await sms.send({
          to: phone,
          body,
          purpose: "transactional",
          idempotencyKey: `route-track-link:${stop.id}`,
          costMetadata: { category: "CLIENT_ROUTE_TRACKING_LINK", templateKey: "route_tracking_link" }
        });
        await recordOwnerSmsEvent({
          trackingId,
          planId,
          operatingDate: String(plan.operating_date).slice(0, 10),
          kind: "link",
          toE164: phone,
          bodyPreview: body,
          ok: sent.ok,
          error: sent.ok ? null : sent.error || "Twilio send failed",
          providerMessageId: sent.providerMessageId || null,
          actorEmail: "system",
          actorRole: "approve_plan",
          meta: { stopId: stop.id }
        });
        if (sent.ok) {
          await supabase
            .from("route_owner_tracking")
            .update({
              link_sent_at: now.toISOString(),
              sms_alerts_enabled: true,
              // Stay pending until Samsara shows the van actually moving toward the stop.
              status: "pending"
            })
            .eq("token", token);
          smsQueued += 1;
        } else {
          smsErrors.push(`${phone}: ${sent.error || "Twilio send failed"}`);
        }
      }
    }
  }

  return {
    created,
    smsQueued,
    smsConfigured: sms.isConfigured(),
    smsEnabled: sendSmsRequested,
    smsDeferredQuietHours: Boolean(sendSmsRequested && quietHoursMessage),
    smsBlockedByKillSwitch: Boolean(options.sendSms && !ownerSmsAllowed),
    smsErrors: smsErrors.slice(0, 25)
  };
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

  const status =
    String(row.status) === "arrived" || String(row.status) === "completed"
      ? String(row.status)
      : etaMinutes != null && etaMinutes <= 2
        ? "pulling_up"
        : String(row.status);
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

/** Cron: refresh ETAs from Samsara and send gated owner SMS. */
export async function processOwnerEtaAlerts(): Promise<{
  checked: number;
  sms30: number;
  sms15: number;
  smsPullup: number;
  skippedQuietHours: number;
  arriving15: number;
  disabledAlerts: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
}> {
  const empty = {
    checked: 0,
    sms30: 0,
    sms15: 0,
    smsPullup: 0,
    skippedQuietHours: 0,
    arriving15: 0,
    disabledAlerts: 0,
    skipped: true,
    errors: [] as string[]
  };

  const supabase = getServiceSupabase();
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const inServiceHours = isWithinRouteOwnerSmsServiceHours(now);

  // Master kill switch — default off. Never text when routes are not intentionally live.
  if (!isRouteOwnerSmsEnabled()) {
    const { data: enabledRows } = await supabase
      .from("route_owner_tracking")
      .select("id")
      .eq("sms_alerts_enabled", true)
      .limit(2000);
    const ids = (enabledRows ?? []).map((row) => String(row.id));
    if (ids.length) {
      await supabase.from("route_owner_tracking").update({ sms_alerts_enabled: false }).in("id", ids);
    }
    return {
      ...empty,
      disabledAlerts: ids.length,
      reason: "route_owner_sms_disabled"
    };
  }

  // Hard stop overnight — do not even evaluate ETA SMS outside 6 AM–8 PM PT.
  if (!inServiceHours) {
    return {
      ...empty,
      skippedQuietHours: 1,
      reason: "quiet_hours"
    };
  }

  // Opt-in only: rows without sms_alerts_enabled never get owner SMS.
  const { data: rows, error: rowsError } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("operating_date", today)
    .eq("sms_alerts_enabled", true)
    .in("status", ["pending", "en_route", "arriving_15", "pulling_up"]);

  if (rowsError) {
    return {
      ...empty,
      skipped: false,
      errors: [rowsError.message]
    };
  }

  const errors: string[] = [];
  let sms30 = 0;
  let sms15 = 0;
  let smsPullup = 0;
  let skippedQuietHours = 0;
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

    const vehicleSpeed =
      typeof match.speedMilesPerHour === "number" && Number.isFinite(match.speedMilesPerHour)
        ? match.speedMilesPerHour
        : null;
    const vehicleTime = match.time || null;
    const etaMinutes = etaMinutesFromCoords(
      { lat: match.latitude, lng: match.longitude },
      { lat: Number(row.stop_latitude), lng: Number(row.stop_longitude) },
      vehicleSpeed && vehicleSpeed >= ROUTE_OWNER_SMS_MIN_SPEED_MPH ? vehicleSpeed : 18
    );

    const nextStatus =
      etaMinutes <= 2 ? "pulling_up" : etaMinutes <= 15 ? "arriving_15" : "en_route";

    const patch: Record<string, unknown> = {
      last_eta_minutes: etaMinutes,
      last_vehicle_latitude: match.latitude,
      last_vehicle_longitude: match.longitude,
      last_vehicle_at: vehicleTime || new Date().toISOString(),
      status: nextStatus
    };

    // Always refresh ETA/location in DB; SMS only when every gate passes.
    const gate = evaluateOwnerEtaSmsGate({
      now,
      smsAlertsEnabled: true,
      ownerPhone: row.owner_phone_e164 ? String(row.owner_phone_e164) : null,
      speedMilesPerHour: vehicleSpeed,
      gpsTime: vehicleTime,
      plannedArrivalAt: row.planned_arrival_at ? String(row.planned_arrival_at) : null,
      windowStart: row.planned_window_start ? String(row.planned_window_start) : null,
      windowEnd: row.planned_window_end ? String(row.planned_window_end) : null
    });

    const canSendSms = sms.isConfigured() && gate.allowed;

    if (!inServiceHours && row.owner_phone_e164) {
      skippedQuietHours += 1;
    }

    if (canSendSms && etaMinutes <= 30 && !row.notified_30_at) {
      const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
      const url = `${publicSiteUrl()}/track/${row.token}`;
      const body = buildRouteEta30Sms({ dogs, etaMinutes, url });
      const sent = await sms.send({
        to: String(row.owner_phone_e164),
        body,
        purpose: "transactional",
        idempotencyKey: `route-eta-30:${row.id}`,
        costMetadata: { category: "CLIENT_ROUTE_30", templateKey: "route_eta_30", multiSegmentFlag: true }
      });
      await recordOwnerSmsEvent({
        trackingId: String(row.id),
        planId: String(row.plan_id),
        operatingDate: String(row.operating_date).slice(0, 10),
        kind: "eta_30",
        toE164: String(row.owner_phone_e164),
        bodyPreview: body,
        ok: sent.ok,
        error: sent.ok ? null : sent.error || "Twilio send failed",
        providerMessageId: sent.providerMessageId || null,
        actorEmail: "cron",
        actorRole: "route-eta-alerts",
        meta: { etaMinutes }
      });
      if (sent.ok) {
        patch.notified_30_at = new Date().toISOString();
        sms30 += 1;
      } else if (sent.error) {
        errors.push(`${row.token}: ${sent.error}`);
      }
    }

    if (etaMinutes <= 15) {
      arriving15 += 1;
      // Only stamp notified_15_at after a successful SMS so a parked/quiet-hours
      // skip can still notify later when the van is actually moving.
      if (canSendSms && !row.notified_15_at) {
        const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
        const url = `${publicSiteUrl()}/track/${row.token}`;
        const body = buildRouteEta15Sms({ dogs, etaMinutes, url });
        const sent = await sms.send({
          to: String(row.owner_phone_e164),
          body,
          purpose: "transactional",
          idempotencyKey: `route-eta-15:${row.id}`,
          costMetadata: { category: "CLIENT_ROUTE_15", templateKey: "route_eta_15", multiSegmentFlag: true }
        });
        await recordOwnerSmsEvent({
          trackingId: String(row.id),
          planId: String(row.plan_id),
          operatingDate: String(row.operating_date).slice(0, 10),
          kind: "eta_15",
          toE164: String(row.owner_phone_e164),
          bodyPreview: body,
          ok: sent.ok,
          error: sent.ok ? null : sent.error || "Twilio send failed",
          providerMessageId: sent.providerMessageId || null,
          actorEmail: "cron",
          actorRole: "route-eta-alerts",
          meta: { etaMinutes }
        });
        if (sent.ok) {
          patch.notified_15_at = new Date().toISOString();
          sms15 += 1;
        } else if (sent.error) {
          errors.push(`${row.token}: ${sent.error}`);
        }
      }
    }

    if (canSendSms && etaMinutes <= 2 && !row.notified_pullup_at) {
      const dogs = ((row.dog_names as string[]) || []).slice(0, 3).join(" + ") || "your dog";
      const url = `${publicSiteUrl()}/track/${row.token}`;
      const body = buildRoutePullupSms({ dogs, url });
      const sent = await sms.send({
        to: String(row.owner_phone_e164),
        body,
        purpose: "transactional",
        idempotencyKey: `route-eta-pullup:${row.id}`,
        costMetadata: { category: "CLIENT_ROUTE_PULLUP", templateKey: "route_pullup", multiSegmentFlag: true }
      });
      await recordOwnerSmsEvent({
        trackingId: String(row.id),
        planId: String(row.plan_id),
        operatingDate: String(row.operating_date).slice(0, 10),
        kind: "pullup",
        toE164: String(row.owner_phone_e164),
        bodyPreview: body,
        ok: sent.ok,
        error: sent.ok ? null : sent.error || "Twilio send failed",
        providerMessageId: sent.providerMessageId || null,
        actorEmail: "cron",
        actorRole: "route-eta-alerts",
        meta: { etaMinutes }
      });
      if (sent.ok) {
        patch.notified_pullup_at = new Date().toISOString();
        patch.status = "pulling_up";
        smsPullup += 1;
      } else if (sent.error) {
        errors.push(`${row.token}: ${sent.error}`);
      }
    }

    await supabase.from("route_owner_tracking").update(patch).eq("id", row.id);
  }

  return {
    checked: rows?.length ?? 0,
    sms30,
    sms15,
    smsPullup,
    skippedQuietHours,
    arriving15,
    disabledAlerts: 0,
    skipped: false,
    errors
  };
}
