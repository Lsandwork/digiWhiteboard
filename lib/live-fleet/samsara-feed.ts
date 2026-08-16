/**
 * Samsara /fleet/vehicles/stats/feed client for Live Fleet.
 * Server-side only — never import from client components.
 */

import {
  normalizeSamsaraVanLabel,
  type SamsaraVehicleLocation
} from "@/lib/route-generator/samsara-live";

export type SamsaraFeedGpsEvent = {
  time: string | null;
  latitude: number;
  longitude: number;
  speedMilesPerHour: number | null;
  heading: number | null;
  address: string | null;
};

export type SamsaraFeedVehicleUpdate = {
  id: string;
  name: string;
  serial: string | null;
  events: SamsaraFeedGpsEvent[];
  /** Latest event in this page batch (if any). */
  latest: SamsaraFeedGpsEvent | null;
};

export type SamsaraFeedPage = {
  vehicles: SamsaraFeedVehicleUpdate[];
  endCursor: string | null;
  hasNextPage: boolean;
  status: number;
};

export class SamsaraFeedError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SamsaraFeedError";
    this.status = status;
  }
}

function samsaraToken(): string | null {
  const token =
    process.env.SAMSARA_API_TOKEN?.trim() ||
    process.env.SAMSARA_API_KEY?.trim() ||
    process.env.SAMSARA_BEARER_TOKEN?.trim() ||
    "";
  return token || null;
}

export function isSamsaraFeedConfigured(): boolean {
  return Boolean(samsaraToken());
}

function extractSerial(row: Record<string, unknown>): string | null {
  const externalIds = row.externalIds as Record<string, string> | undefined;
  const gateway = row.gateway as { serial?: string } | undefined;
  return externalIds?.["samsara.serial"] || gateway?.serial || null;
}

function parseGpsEvent(raw: Record<string, unknown>): SamsaraFeedGpsEvent | null {
  const lat = raw.latitude;
  const lng = raw.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const reverseGeo = raw.reverseGeo as { formattedLocation?: string } | undefined;
  const addressBook = raw.address as { name?: string } | undefined;
  const address =
    (typeof reverseGeo?.formattedLocation === "string" && reverseGeo.formattedLocation.trim()) ||
    (typeof addressBook?.name === "string" && addressBook.name.trim()) ||
    null;
  return {
    time: typeof raw.time === "string" ? raw.time : null,
    latitude: lat,
    longitude: lng,
    speedMilesPerHour:
      typeof raw.speedMilesPerHour === "number" && Number.isFinite(raw.speedMilesPerHour)
        ? raw.speedMilesPerHour
        : null,
    heading:
      typeof raw.headingDegrees === "number" && Number.isFinite(raw.headingDegrees)
        ? raw.headingDegrees
        : null,
    address
  };
}

/**
 * Fetch one page of the vehicle stats feed.
 * Pass `after` from a previous endCursor for incremental updates.
 */
export async function fetchSamsaraStatsFeedPage(params?: {
  after?: string | null;
  signal?: AbortSignal;
}): Promise<SamsaraFeedPage> {
  const token = samsaraToken();
  if (!token) {
    throw new SamsaraFeedError(0, "Samsara API token is not configured.");
  }

  const url = new URL("https://api.samsara.com/fleet/vehicles/stats/feed");
  url.searchParams.set("types", "gps");
  if (params?.after) url.searchParams.set("after", params.after);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: params?.signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new SamsaraFeedError(
      response.status,
      `Samsara stats/feed failed (${response.status}): ${text.slice(0, 200)}`
    );
  }

  const body = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
    pagination?: { endCursor?: string; hasNextPage?: boolean };
  };

  const vehicles: SamsaraFeedVehicleUpdate[] = [];
  for (const row of body.data ?? []) {
    const id = String(row.id ?? "");
    const name = String(row.name || "").trim();
    const serial = extractSerial(row);
    const gpsRaw = row.gps;
    const events: SamsaraFeedGpsEvent[] = [];
    if (Array.isArray(gpsRaw)) {
      for (const event of gpsRaw) {
        const parsed = parseGpsEvent(event as Record<string, unknown>);
        if (parsed) events.push(parsed);
      }
    } else if (gpsRaw && typeof gpsRaw === "object") {
      const parsed = parseGpsEvent(gpsRaw as Record<string, unknown>);
      if (parsed) events.push(parsed);
    }
    const latest = events.length ? events[events.length - 1] : null;
    vehicles.push({ id, name, serial, events, latest });
  }

  return {
    vehicles,
    endCursor: body.pagination?.endCursor ?? null,
    hasNextPage: Boolean(body.pagination?.hasNextPage),
    status: response.status
  };
}

/**
 * Drain feed pages while hasNextPage is true (bounded).
 * Caller should wait ≥5s before the next poll when hasNextPage is false.
 */
export async function fetchSamsaraStatsFeedUntilCaughtUp(params?: {
  after?: string | null;
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<{
  vehicles: SamsaraFeedVehicleUpdate[];
  endCursor: string | null;
  hasNextPage: boolean;
  pages: number;
}> {
  const maxPages = params?.maxPages ?? 10;
  let after = params?.after ?? null;
  let hasNextPage = true;
  let pages = 0;
  const byId = new Map<string, SamsaraFeedVehicleUpdate>();

  while (hasNextPage && pages < maxPages) {
    const page = await fetchSamsaraStatsFeedPage({ after, signal: params?.signal });
    pages += 1;
    for (const vehicle of page.vehicles) {
      const existing = byId.get(vehicle.id);
      if (!existing) {
        byId.set(vehicle.id, vehicle);
      } else {
        const events = [...existing.events, ...vehicle.events];
        byId.set(vehicle.id, {
          ...vehicle,
          events,
          latest: events.length ? events[events.length - 1] : existing.latest
        });
      }
    }
    after = page.endCursor;
    hasNextPage = page.hasNextPage;
    if (!page.hasNextPage) break;
  }

  return {
    vehicles: [...byId.values()],
    endCursor: after,
    hasNextPage,
    pages
  };
}

/** Convert feed latest events into the snapshot shape used by owner-tracking matchers. */
export function feedUpdatesToLocations(updates: SamsaraFeedVehicleUpdate[]): SamsaraVehicleLocation[] {
  const out: SamsaraVehicleLocation[] = [];
  for (const v of updates) {
    if (!v.latest) continue;
    out.push({
      id: v.id,
      name: v.name,
      serial: v.serial,
      latitude: v.latest.latitude,
      longitude: v.latest.longitude,
      speedMilesPerHour: v.latest.speedMilesPerHour,
      heading: v.latest.heading,
      time: v.latest.time
    });
  }
  return out;
}

export { normalizeSamsaraVanLabel };
