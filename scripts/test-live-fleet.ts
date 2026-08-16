/**
 * Live Fleet unit tests — Samsara feed normalization, progress, status, access, payload safety.
 * Run: npx tsx scripts/test-live-fleet.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  accessFromLegacyRole,
  canAccessAdminTab
} from "../lib/admin/permissions";
import { canAccessLiveFleet } from "../lib/live-fleet/access";
import {
  buildNextStopInfo,
  computeRouteProgress,
  findNextStop,
  resolveStopStatuses
} from "../lib/live-fleet/progress";
import { classifyFreshness, classifyGpsStatus } from "../lib/live-fleet/status";
import { feedUpdatesToLocations, normalizeSamsaraVanLabel } from "../lib/live-fleet/samsara-feed";
import { matchVehicleByName } from "../lib/route-generator/samsara-live";
import type { LiveFleetStop } from "../lib/live-fleet/types";
import { SUPER_ADMIN_HUBS } from "../lib/admin/super-admin-nav";
import { filterHubDefinition } from "../lib/admin/role-hub-nav";

// --- Access ---
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "live_fleet", "owner_admin", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "live_fleet", "owner_admin", "lobby"),
  false,
  "Live Fleet must stay staff-board only"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "manager_admin"), "live_fleet", "manager_admin", "staff"),
  true,
  "Admins can open Live Fleet"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "live_fleet", "assistant_manager", "staff"),
  true,
  "Management can open Live Fleet"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "live_fleet", "front_desk_coordinator", "staff"),
  true,
  "Front Desk Coordinators can open Live Fleet"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "route_generator", "front_desk_coordinator", "staff"),
  false,
  "Front Desk Coordinators still cannot open Route Generator"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), "live_fleet", "driver", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "hiker"), "live_fleet", "hiker", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "live_fleet", "daycare", "staff"),
  false
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "live_fleet", "team_leader", "staff"),
  false,
  "Team Leads do not get Live Fleet"
);
assert.equal(canAccessLiveFleet(accessFromLegacyRole(null, null, "hiker"), "hiker"), true);
assert.equal(canAccessLiveFleet(accessFromLegacyRole(null, null, "trainer"), "trainer"), false);
assert.equal(canAccessLiveFleet(accessFromLegacyRole(null, null, "front_desk_coordinator"), "front_desk_coordinator"), true);

// Apps hub must surface Live Fleet when the tab is visible for the role
{
  const apps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["live_fleet", "route_generator", "ops_system_health"]);
  const labels = apps.sections.flatMap((s) => s.links.map((l) => l.label));
  assert.ok(labels.includes("Live Fleet"), "Apps hub includes Live Fleet link");
}

// --- GPS status / freshness ---
const now = Date.parse("2026-08-15T18:00:00.000Z");
assert.equal(
  classifyGpsStatus({
    latitude: 34.0,
    longitude: -118.4,
    speedMph: 22,
    gpsTimestamp: new Date(now - 8_000).toISOString(),
    now
  }),
  "moving"
);
assert.equal(
  classifyGpsStatus({
    latitude: 34.0,
    longitude: -118.4,
    speedMph: 0,
    gpsTimestamp: new Date(now - 8_000).toISOString(),
    now
  }),
  "parked"
);
assert.equal(
  classifyGpsStatus({
    latitude: 34.0,
    longitude: -118.4,
    speedMph: 30,
    gpsTimestamp: new Date(now - 8 * 60_000).toISOString(),
    now
  }),
  "stale",
  "stale GPS must not remain moving"
);
assert.equal(
  classifyGpsStatus({
    latitude: null,
    longitude: null,
    speedMph: null,
    gpsTimestamp: null,
    now
  }),
  "offline"
);

assert.equal(
  classifyFreshness({
    gpsTimestamp: new Date(now - 8_000).toISOString(),
    hasPosition: true,
    now
  }).freshness,
  "live"
);
assert.equal(
  classifyFreshness({
    gpsTimestamp: new Date(now - 90_000).toISOString(),
    hasPosition: true,
    now
  }).freshness,
  "delayed"
);
assert.equal(
  classifyFreshness({
    gpsTimestamp: new Date(now - 8 * 60_000).toISOString(),
    hasPosition: true,
    now
  }).freshness,
  "stale"
);
assert.equal(
  classifyFreshness({ gpsTimestamp: null, hasPosition: false, now }).freshness,
  "unavailable"
);

// --- Feed normalization helpers ---
const locations = feedUpdatesToLocations([
  {
    id: "sv-1",
    name: "Van 01",
    serial: "GXPD-PPW-GEV",
    events: [
      {
        time: "2026-08-15T17:59:50.000Z",
        latitude: 34.01,
        longitude: -118.4,
        speedMilesPerHour: 12,
        heading: 90,
        address: "Santa Monica"
      }
    ],
    latest: {
      time: "2026-08-15T17:59:50.000Z",
      latitude: 34.01,
      longitude: -118.4,
      speedMilesPerHour: 12,
      heading: 90,
      address: "Santa Monica"
    }
  },
  {
    id: "sv-empty",
    name: "Idle",
    serial: null,
    events: [],
    latest: null
  }
]);
assert.equal(locations.length, 1);
assert.equal(locations[0].id, "sv-1");
assert.equal(normalizeSamsaraVanLabel("Van 01"), normalizeSamsaraVanLabel("van_1"));

const matched = matchVehicleByName(locations, "Van 01", "GXPD-PPW-GEV");
assert.ok(matched);
assert.equal(matched?.id, "sv-1");

// --- Route progress / next stop ---
const stops: LiveFleetStop[] = [
  {
    id: "s0",
    sequence: 0,
    stopKind: "depot_start",
    direction: "departure",
    label: "Fitdog Departure",
    dogNames: [],
    address: "Hub",
    locationType: "FITDOG",
    latitude: 34.03,
    longitude: -118.45,
    etaArrival: null,
    status: "completed",
    isNext: false
  },
  {
    id: "s1",
    sequence: 1,
    stopKind: "customer",
    direction: "pickup",
    label: "Baxter",
    dogNames: ["Baxter"],
    address: "1 Main",
    locationType: "HOME",
    latitude: 34.04,
    longitude: -118.41,
    etaArrival: null,
    status: "completed",
    isNext: false
  },
  {
    id: "s2",
    sequence: 2,
    stopKind: "customer",
    direction: "pickup",
    label: "Teddy",
    dogNames: ["Teddy"],
    address: "2 Main",
    locationType: "HOME",
    latitude: 34.05,
    longitude: -118.42,
    etaArrival: null,
    status: "current",
    isNext: true
  },
  {
    id: "s3",
    sequence: 3,
    stopKind: "customer",
    direction: "pickup",
    label: "Atlas",
    dogNames: ["Atlas"],
    address: "3 Main",
    locationType: "HOME",
    latitude: 34.06,
    longitude: -118.43,
    etaArrival: null,
    status: "upcoming",
    isNext: false
  }
];

const progress = computeRouteProgress(stops);
assert.equal(progress.completedStops, 2);
assert.equal(progress.totalStops, 4);
assert.equal(progress.progressPercent, 50);
assert.equal(progress.routeStatus, "active");

const next = findNextStop(stops);
assert.equal(next?.id, "s2");

const nextInfo = buildNextStopInfo({
  stop: next!,
  vehicle: { lat: 34.045, lng: -118.415, speedMph: 20 },
  gpsFresh: true
});
assert.ok(nextInfo);
assert.equal(nextInfo?.dogName, "Teddy");
assert.equal(nextInfo?.etaReliable, true);
assert.ok((nextInfo?.etaMinutes ?? 0) >= 1);

const noEta = buildNextStopInfo({
  stop: next!,
  vehicle: { lat: 34.045, lng: -118.415, speedMph: 20 },
  gpsFresh: false
});
assert.equal(noEta?.etaReliable, false);
assert.equal(noEta?.etaMinutes, null);

const completedOnly = computeRouteProgress(
  stops.map((s) => ({ ...s, status: "completed" as const, isNext: false }))
);
assert.equal(completedOnly.routeStatus, "complete");
assert.equal(completedOnly.progressPercent, 100);

assert.equal(computeRouteProgress([]).routeStatus, "no_route");

// Tracking-based status resolution
const statusMap = resolveStopStatuses({
  stops: [
    { id: "a", stopKind: "depot_start", sequence: 0 },
    { id: "b", stopKind: "customer", sequence: 1 },
    { id: "c", stopKind: "customer", sequence: 2 },
    { id: "d", stopKind: "depot_end", sequence: 3 }
  ],
  trackingByStopId: new Map([
    ["b", ["completed"]],
    ["c", ["en_route"]]
  ])
});
assert.equal(statusMap.get("a"), "completed");
assert.equal(statusMap.get("b"), "completed");
assert.equal(statusMap.get("c"), "current");
assert.equal(statusMap.get("d"), "upcoming");

const noRouteStatuses = resolveStopStatuses({
  stops: [
    { id: "a", stopKind: "depot_start", sequence: 0 },
    { id: "b", stopKind: "customer", sequence: 1 }
  ],
  trackingByStopId: new Map()
});
assert.equal(noRouteStatuses.get("a"), "current");

// --- Security: client sources must not embed Samsara tokens ---
const apiRoute = readFileSync(path.join(process.cwd(), "app/api/admin/live-fleet/route.ts"), "utf8");
assert.match(apiRoute, /assertSafeClientPayload/);
assert.doesNotMatch(apiRoute, /NEXT_PUBLIC_SAMSARA/);

const feedSrc = readFileSync(path.join(process.cwd(), "lib/live-fleet/samsara-feed.ts"), "utf8");
assert.match(feedSrc, /Authorization: `Bearer \$\{token\}`/);
assert.doesNotMatch(feedSrc, /NEXT_PUBLIC_SAMSARA/);

const panelSrc = readFileSync(path.join(process.cwd(), "components/admin/live-fleet/LiveFleetPanel.tsx"), "utf8");
assert.doesNotMatch(panelSrc, /SAMSARA_API_TOKEN|SAMSARA_API_KEY|SAMSARA_BEARER_TOKEN/);
assert.match(panelSrc, /\/api\/admin\/live-fleet|useLiveFleet/);
assert.match(panelSrc, /focusToken/);
assert.match(panelSrc, /absolute inset-0/);

const mapSrc = readFileSync(path.join(process.cwd(), "components/admin/live-fleet/LiveFleetMap.tsx"), "utf8");
assert.match(mapSrc, /flyTo/);
assert.match(mapSrc, /invalidateSize/);
assert.match(mapSrc, /ResizeObserver/);
assert.match(mapSrc, /dark_all/);

const ownerTrackApi = readFileSync(path.join(process.cwd(), "app/api/track/[token]/route.ts"), "utf8");
assert.doesNotMatch(ownerTrackApi, /live-fleet|getLiveFleetSnapshot/);

// Owner tracking must stay token-gated (existing route still requires token param).
assert.match(ownerTrackApi, /token/);

// Migration exists for durable mapping + cache
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/076_live_fleet_telemetry.sql"),
  "utf8"
);
assert.match(migration, /samsara_vehicle_id/);
assert.match(migration, /route_fleet_sync_state/);
assert.match(migration, /route_fleet_vehicle_telemetry/);

// Cursor / hasNextPage concepts present in feed client
assert.match(feedSrc, /hasNextPage/);
assert.match(feedSrc, /endCursor|end_cursor|after/);

console.log("test-live-fleet: ok");
