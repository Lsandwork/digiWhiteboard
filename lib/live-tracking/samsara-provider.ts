import { assertNeverVan4, TRACKING_VANS, type TrackingVanKey } from "@/lib/live-tracking/flags";

export type SamsaraVehicleGps = {
  vehicleId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  recordedAt: string;
};

export type SamsaraRouteStopEta = {
  routeId: string;
  stopId: string;
  etaAt: string | null;
  state: string | null;
  vehicleId: string | null;
};

export type SamsaraLiveTrackingProvider = {
  id: string;
  isConfigured(): boolean;
  fetchVehicleStatsSnapshot(vehicleIds: string[]): Promise<SamsaraVehicleGps[]>;
  fetchVehicleStatsFeed(params: {
    cursor?: string | null;
    vehicleIds?: string[];
  }): Promise<{ locations: SamsaraVehicleGps[]; nextCursor: string | null; hasNextPage: boolean }>;
  fetchRouteStopEtas(routeIds: string[]): Promise<SamsaraRouteStopEta[]>;
};

const SAMSARA_BASE = "https://api.samsara.com";

function getToken() {
  return process.env.SAMSARA_API_TOKEN?.trim() || "";
}

async function samsaraGet(path: string, query?: Record<string, string>) {
  const token = getToken();
  if (!token) throw new Error("Samsara API token is not configured.");
  const url = new URL(path, SAMSARA_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Samsara HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

function parseGpsFromStats(payload: unknown): SamsaraVehicleGps[] {
  const root = payload as { data?: Array<Record<string, unknown>> };
  const rows = root.data ?? [];
  const out: SamsaraVehicleGps[] = [];
  for (const row of rows) {
    const vehicleId = String(row.id ?? row.vehicleId ?? "");
    if (!vehicleId) continue;
    const gps = (row.gps as Record<string, unknown> | undefined) ?? row;
    const lat = Number(gps.latitude ?? gps.lat);
    const lng = Number(gps.longitude ?? gps.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const time =
      String(gps.time ?? gps.timestamp ?? row.time ?? new Date().toISOString());
    out.push({
      vehicleId,
      latitude: lat,
      longitude: lng,
      heading: gps.heading == null ? null : Number(gps.heading),
      speedMps: gps.speed == null ? null : Number(gps.speed),
      accuracyMeters: gps.accuracyMillimeters == null ? null : Number(gps.accuracyMillimeters) / 1000,
      recordedAt: time
    });
  }
  return out;
}

export function createSamsaraLiveTrackingProvider(): SamsaraLiveTrackingProvider {
  return {
    id: "samsara",
    isConfigured() {
      return Boolean(getToken());
    },
    async fetchVehicleStatsSnapshot(vehicleIds) {
      if (!vehicleIds.length) return [];
      const json = await samsaraGet("/fleet/vehicles/stats", {
        vehicleIds: vehicleIds.join(","),
        types: "gps"
      });
      return parseGpsFromStats(json);
    },
    async fetchVehicleStatsFeed(params) {
      const query: Record<string, string> = { types: "gps" };
      if (params.cursor) query.after = params.cursor;
      if (params.vehicleIds?.length) query.vehicleIds = params.vehicleIds.join(",");
      const json = await samsaraGet("/fleet/vehicles/stats/feed", query);
      const pagination = (json as { pagination?: { endCursor?: string; hasNextPage?: boolean } }).pagination;
      return {
        locations: parseGpsFromStats(json),
        nextCursor: pagination?.endCursor ?? null,
        hasNextPage: Boolean(pagination?.hasNextPage)
      };
    },
    async fetchRouteStopEtas(routeIds) {
      // Prefer route-events when available; fall back to empty when not configured.
      if (!routeIds.length) return [];
      try {
        const json = await samsaraGet("/fleet/routes", {
          ids: routeIds.join(",")
        });
        const data = ((json as { data?: Array<Record<string, unknown>> }).data ?? []) as Array<
          Record<string, unknown>
        >;
        const out: SamsaraRouteStopEta[] = [];
        for (const route of data) {
          const routeId = String(route.id ?? "");
          const stops = (route.stops as Array<Record<string, unknown>> | undefined) ?? [];
          for (const stop of stops) {
            out.push({
              routeId,
              stopId: String(stop.id ?? ""),
              etaAt: stop.eta == null ? null : String(stop.eta),
              state: stop.state == null ? null : String(stop.state),
              vehicleId: route.vehicleId == null ? null : String(route.vehicleId)
            });
          }
        }
        return out;
      } catch {
        return [];
      }
    }
  };
}

export const samsaraLiveTrackingProvider = createSamsaraLiveTrackingProvider();

export function mapDisplayNameToVanKey(name: string): TrackingVanKey | null {
  assertNeverVan4(name);
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, TrackingVanKey> = {
    "van 1": "van_1",
    van1: "van_1",
    "van 2": "van_2",
    van2: "van_2",
    "van 3": "van_3",
    van3: "van_3",
    "van 5": "van_5",
    van5: "van_5",
    "van 6": "van_6",
    van6: "van_6"
  };
  const key = map[normalized];
  if (!key) return null;
  if (!(TRACKING_VANS as readonly string[]).includes(key)) return null;
  return key;
}
