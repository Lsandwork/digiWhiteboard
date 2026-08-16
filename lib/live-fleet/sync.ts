/**
 * Controlled Samsara → shared telemetry cache sync.
 * Multiple browsers read the cache; only the server hits Samsara on a cooldown.
 */

import {
  fetchSamsaraStatsFeedUntilCaughtUp,
  isSamsaraFeedConfigured,
  SamsaraFeedError,
  type SamsaraFeedVehicleUpdate
} from "@/lib/live-fleet/samsara-feed";
import { classifyGpsStatus } from "@/lib/live-fleet/status";
import {
  matchVehicleByName,
  normalizeSamsaraVanLabel,
  type SamsaraVehicleLocation
} from "@/lib/route-generator/samsara-live";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Minimum wait between feed polls when hasNextPage is false (Samsara guidance). */
export const LIVE_FLEET_MIN_POLL_MS = 5_000;

export type VehicleConfigRow = {
  van_key: string;
  display_name: string;
  samsara_vehicle_name: string | null;
  samsara_serial: string | null;
  samsara_vehicle_id: string | null;
  driver_name: string | null;
  active: boolean;
};

export type SyncResult = {
  configured: boolean;
  simulated: boolean;
  synced: boolean;
  skipped: boolean;
  skipReason: string | null;
  updateCount: number;
  endCursor: string | null;
  hasNextPage: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  mappingFailures: string[];
};

function logFleet(event: string, detail: Record<string, unknown>) {
  // Never log tokens or customer tracking tokens.
  console.info(
    JSON.stringify({
      scope: "live_fleet",
      event,
      ...detail,
      at: new Date().toISOString()
    })
  );
}

function isSimulateEnabled(): boolean {
  return process.env.LIVE_FLEET_SIMULATE_GPS === "1" || process.env.LIVE_FLEET_SIMULATE_GPS === "true";
}

function matchConfig(
  configs: VehicleConfigRow[],
  update: SamsaraFeedVehicleUpdate
): VehicleConfigRow | null {
  const byId = configs.find(
    (c) => c.samsara_vehicle_id && String(c.samsara_vehicle_id) === String(update.id)
  );
  if (byId) return byId;

  const asLocation: SamsaraVehicleLocation = {
    id: update.id,
    name: update.name,
    serial: update.serial,
    latitude: update.latest?.latitude ?? 0,
    longitude: update.latest?.longitude ?? 0,
    speedMilesPerHour: update.latest?.speedMilesPerHour ?? null,
    heading: update.latest?.heading ?? null,
    time: update.latest?.time ?? null
  };

  for (const config of configs) {
    const matched = matchVehicleByName(
      [asLocation],
      config.samsara_vehicle_name,
      config.samsara_serial
    );
    if (matched) return config;
  }

  // Fallback: match update name against configured names.
  const target = normalizeSamsaraVanLabel(update.name);
  if (!target) return null;
  return (
    configs.find((c) => normalizeSamsaraVanLabel(c.samsara_vehicle_name) === target) ??
    configs.find((c) => {
      const n = normalizeSamsaraVanLabel(c.samsara_vehicle_name);
      return n && (n.includes(target) || target.includes(n));
    }) ??
    null
  );
}

async function loadVehicleConfigs(): Promise<VehicleConfigRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("route_vehicle_configs")
    .select("van_key, display_name, samsara_vehicle_name, samsara_serial, samsara_vehicle_id, driver_name, active")
    .order("van_key");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    van_key: String(row.van_key),
    display_name: String(row.display_name || row.van_key),
    samsara_vehicle_name: row.samsara_vehicle_name == null ? null : String(row.samsara_vehicle_name),
    samsara_serial: row.samsara_serial == null ? null : String(row.samsara_serial),
    samsara_vehicle_id: row.samsara_vehicle_id == null ? null : String(row.samsara_vehicle_id),
    driver_name: row.driver_name == null ? null : String(row.driver_name),
    active: Boolean(row.active)
  }));
}

async function loadSyncState(): Promise<{
  end_cursor: string | null;
  has_next_page: boolean;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_status: number | null;
  last_update_count: number;
  simulated: boolean;
}> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("route_fleet_sync_state").select("*").eq("id", "default").maybeSingle();
  return {
    end_cursor: data?.end_cursor == null ? null : String(data.end_cursor),
    has_next_page: Boolean(data?.has_next_page),
    last_sync_at: data?.last_sync_at == null ? null : String(data.last_sync_at),
    last_success_at: data?.last_success_at == null ? null : String(data.last_success_at),
    last_error: data?.last_error == null ? null : String(data.last_error),
    last_error_status: data?.last_error_status == null ? null : Number(data.last_error_status),
    last_update_count: Number(data?.last_update_count ?? 0),
    simulated: Boolean(data?.simulated)
  };
}

async function applyVehicleUpdates(
  configs: VehicleConfigRow[],
  updates: SamsaraFeedVehicleUpdate[],
  simulated: boolean
): Promise<{ updateCount: number; mappingFailures: string[]; idLinks: Array<{ vanKey: string; samsaraId: string }> }> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  let updateCount = 0;
  const mappingFailures: string[] = [];
  const idLinks: Array<{ vanKey: string; samsaraId: string }> = [];

  for (const update of updates) {
    if (!update.latest) continue;
    const config = matchConfig(configs, update);
    if (!config) {
      mappingFailures.push(`${update.name || update.id}`);
      continue;
    }
    const gps = update.latest;
    const status = classifyGpsStatus({
      latitude: gps.latitude,
      longitude: gps.longitude,
      speedMph: gps.speedMilesPerHour,
      gpsTimestamp: gps.time
    });

    const { error } = await supabase.from("route_fleet_vehicle_telemetry").upsert(
      {
        van_key: config.van_key,
        samsara_vehicle_id: update.id || null,
        samsara_vehicle_name: update.name || config.samsara_vehicle_name,
        latitude: gps.latitude,
        longitude: gps.longitude,
        heading: gps.heading,
        speed_mph: gps.speedMilesPerHour,
        address: gps.address,
        gps_timestamp: gps.time,
        received_at: nowIso,
        status,
        simulated,
        raw_summary: {
          eventCount: update.events.length,
          name: update.name
        },
        updated_at: nowIso
      },
      { onConflict: "van_key" }
    );
    if (error) {
      logFleet("telemetry_upsert_failed", { vanKey: config.van_key, message: error.message });
      continue;
    }
    updateCount += 1;
    if (update.id && config.samsara_vehicle_id !== update.id) {
      idLinks.push({ vanKey: config.van_key, samsaraId: update.id });
    }
  }

  for (const link of idLinks) {
    await supabase
      .from("route_vehicle_configs")
      .update({ samsara_vehicle_id: link.samsaraId, updated_at: nowIso })
      .eq("van_key", link.vanKey)
      .is("samsara_vehicle_id", null);
  }

  return { updateCount, mappingFailures, idLinks };
}

async function writeSimulatedTelemetry(configs: VehicleConfigRow[]): Promise<number> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const active = configs.filter((c) => c.active);
  // Fitdog Westwood-ish spread — clearly fake and labeled simulated.
  const base = { lat: 34.033, lng: -118.435 };
  let n = 0;
  for (let i = 0; i < active.length; i++) {
    const config = active[i];
    const lat = base.lat + i * 0.008;
    const lng = base.lng + (i % 2 === 0 ? 0.01 : -0.012);
    await supabase.from("route_fleet_vehicle_telemetry").upsert(
      {
        van_key: config.van_key,
        samsara_vehicle_id: `sim-${config.van_key}`,
        samsara_vehicle_name: config.samsara_vehicle_name,
        latitude: lat,
        longitude: lng,
        heading: 45 + i * 30,
        speed_mph: 12,
        address: "SIMULATED GPS — not real telemetry",
        gps_timestamp: nowIso,
        received_at: nowIso,
        status: "moving",
        simulated: true,
        raw_summary: { simulated: true },
        updated_at: nowIso
      },
      { onConflict: "van_key" }
    );
    n += 1;
  }
  return n;
}

/**
 * Sync Samsara feed into shared cache when due.
 * Safe to call from every Live Fleet API request — enforces cooldown.
 */
export async function syncLiveFleetTelemetry(options?: {
  force?: boolean;
}): Promise<SyncResult> {
  const configured = isSamsaraFeedConfigured();
  const simulatedFlag = isSimulateEnabled();
  const state = await loadSyncState();
  const now = Date.now();
  const lastSyncMs = state.last_sync_at ? Date.parse(state.last_sync_at) : 0;
  const sinceLast = now - (Number.isFinite(lastSyncMs) ? lastSyncMs : 0);

  // When hasNextPage, drain immediately; otherwise respect ~5s cooldown.
  const cooldownOk = state.has_next_page || sinceLast >= LIVE_FLEET_MIN_POLL_MS || !state.last_sync_at;
  if (!options?.force && state.last_sync_at && !cooldownOk) {
    return {
      configured,
      simulated: state.simulated,
      synced: false,
      skipped: true,
      skipReason: "cooldown",
      updateCount: state.last_update_count,
      endCursor: state.end_cursor,
      hasNextPage: state.has_next_page,
      lastSyncAt: state.last_sync_at,
      lastSuccessAt: state.last_success_at,
      lastError: state.last_error,
      lastErrorStatus: state.last_error_status,
      mappingFailures: []
    };
  }

  const supabase = getServiceSupabase();
  const configs = await loadVehicleConfigs();
  const syncAt = new Date().toISOString();

  if (!configured) {
    if (simulatedFlag) {
      const updateCount = await writeSimulatedTelemetry(configs);
      await supabase.from("route_fleet_sync_state").upsert({
        id: "default",
        end_cursor: null,
        has_next_page: false,
        last_sync_at: syncAt,
        last_success_at: syncAt,
        last_error: null,
        last_error_status: null,
        last_update_count: updateCount,
        simulated: true,
        updated_at: syncAt
      });
      logFleet("sync_simulated", { updateCount });
      return {
        configured: false,
        simulated: true,
        synced: true,
        skipped: false,
        skipReason: null,
        updateCount,
        endCursor: null,
        hasNextPage: false,
        lastSyncAt: syncAt,
        lastSuccessAt: syncAt,
        lastError: null,
        lastErrorStatus: null,
        mappingFailures: []
      };
    }

    await supabase.from("route_fleet_sync_state").upsert({
      id: "default",
      last_sync_at: syncAt,
      last_error: "Samsara API token is not configured.",
      last_error_status: 0,
      last_update_count: 0,
      simulated: false,
      updated_at: syncAt
    });
    logFleet("sync_unconfigured", {});
    return {
      configured: false,
      simulated: false,
      synced: false,
      skipped: false,
      skipReason: "missing_token",
      updateCount: 0,
      endCursor: state.end_cursor,
      hasNextPage: false,
      lastSyncAt: syncAt,
      lastSuccessAt: state.last_success_at,
      lastError: "Samsara API token is not configured.",
      lastErrorStatus: 0,
      mappingFailures: []
    };
  }

  try {
    const feed = await fetchSamsaraStatsFeedUntilCaughtUp({
      after: state.end_cursor,
      maxPages: 8
    });
    const { updateCount, mappingFailures } = await applyVehicleUpdates(configs, feed.vehicles, false);

    // Refresh stale classification for vans that did not receive an update this cycle.
    const { data: existing } = await supabase.from("route_fleet_vehicle_telemetry").select("*");
    for (const row of existing ?? []) {
      if (row.simulated) continue;
      const status = classifyGpsStatus({
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        speedMph: row.speed_mph == null ? null : Number(row.speed_mph),
        gpsTimestamp: row.gps_timestamp == null ? null : String(row.gps_timestamp)
      });
      if (status !== row.status) {
        await supabase
          .from("route_fleet_vehicle_telemetry")
          .update({ status, updated_at: syncAt })
          .eq("van_key", row.van_key);
      }
    }

    await supabase.from("route_fleet_sync_state").upsert({
      id: "default",
      end_cursor: feed.endCursor,
      has_next_page: feed.hasNextPage,
      last_sync_at: syncAt,
      last_success_at: syncAt,
      last_error: null,
      last_error_status: null,
      last_update_count: updateCount,
      simulated: false,
      updated_at: syncAt
    });

    logFleet("sync_success", {
      updateCount,
      pages: feed.pages,
      hasNextPage: feed.hasNextPage,
      cursorAdvanced: Boolean(feed.endCursor && feed.endCursor !== state.end_cursor),
      mappingFailureCount: mappingFailures.length
    });
    if (mappingFailures.length) {
      logFleet("mapping_failures", { vehicles: mappingFailures.slice(0, 20) });
    }

    return {
      configured: true,
      simulated: false,
      synced: true,
      skipped: false,
      skipReason: null,
      updateCount,
      endCursor: feed.endCursor,
      hasNextPage: feed.hasNextPage,
      lastSyncAt: syncAt,
      lastSuccessAt: syncAt,
      lastError: null,
      lastErrorStatus: null,
      mappingFailures
    };
  } catch (err) {
    const status = err instanceof SamsaraFeedError ? err.status : 0;
    const message =
      err instanceof Error ? err.message.slice(0, 300) : "Unknown Samsara sync error";
    await supabase.from("route_fleet_sync_state").upsert({
      id: "default",
      last_sync_at: syncAt,
      last_error: message,
      last_error_status: status || null,
      simulated: false,
      updated_at: syncAt
    });
    logFleet("sync_error", { status, message });
    return {
      configured: true,
      simulated: false,
      synced: false,
      skipped: false,
      skipReason: null,
      updateCount: 0,
      endCursor: state.end_cursor,
      hasNextPage: state.has_next_page,
      lastSyncAt: syncAt,
      lastSuccessAt: state.last_success_at,
      lastError: message,
      lastErrorStatus: status || null,
      mappingFailures: []
    };
  }
}

export async function getLiveFleetSyncMeta(): Promise<{
  configured: boolean;
  simulated: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  lastUpdateCount: number;
  hasNextPage: boolean;
}> {
  const state = await loadSyncState();
  return {
    configured: isSamsaraFeedConfigured(),
    simulated: state.simulated,
    lastSyncAt: state.last_sync_at,
    lastSuccessAt: state.last_success_at,
    lastError: state.last_error,
    lastErrorStatus: state.last_error_status,
    lastUpdateCount: state.last_update_count,
    hasNextPage: state.has_next_page
  };
}

export { loadVehicleConfigs };
