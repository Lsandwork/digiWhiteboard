/**
 * Gingr Route Generator unit tests — activity matching, normalize, cache/inflight.
 * Run: npx tsx scripts/test-gingr-route-generator.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import {
  GINGR_ROUTE_ACTIVITIES,
  isDropOffService,
  isPickUpService,
  matchGingrRouteActivity
} from "../lib/gingr-route-generator/activities";
import {
  invalidateGingrRouteCache,
  readGingrRouteCache,
  withGingrRouteInflight,
  writeGingrRouteCache
} from "../lib/gingr-route-generator/cache";
import { normalizeGingrRouteReservations } from "../lib/gingr-route-generator/normalize";
import { todayPacificDateKey } from "../lib/gingr-route-generator/service";
import {
  appendAuthenticatedGlobalRoutes,
  GINGR_ROUTE_GENERATOR_NAV_ROUTE
} from "../lib/admin/nav-groups";
import { SUPER_ADMIN_HUBS } from "../lib/admin/super-admin-nav";
import { filterHubDefinition } from "../lib/admin/role-hub-nav";

// --- Activity matching ---
assert.equal(matchGingrRouteActivity("Adventure Hike")?.id, "adventure_hike");
assert.equal(matchGingrRouteActivity("Beach Excursions")?.id, "beach_excursion");
assert.equal(matchGingrRouteActivity("Fun & Fit Agility")?.id, "fun_and_fit_agility");
assert.equal(matchGingrRouteActivity("Foundations and Focus")?.id, "foundations_and_focus");
assert.equal(matchGingrRouteActivity("Scent Work")?.id, "scent_works");
assert.equal(matchGingrRouteActivity("Daycare Full Day"), null);
assert.equal(matchGingrRouteActivity(""), null);

assert.equal(isPickUpService("Pick Up - Adventure Hike"), true);
assert.equal(isPickUpService("Door to Door Taxi"), true);
assert.equal(isDropOffService("Drop Off After Hike"), true);
assert.equal(isDropOffService("Pick Up"), false);
assert.equal(isDropOffService("Adventure Hike"), false);

assert.equal(GINGR_ROUTE_ACTIVITIES.length, 10);

// --- Normalize fixtures ---
function reservation(partial: Record<string, unknown>): GingrReservation {
  return partial as GingrReservation;
}

const date = "2026-08-31";

const hikeReservation = reservation({
  id: "1001",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Adventure Hike",
  start_date: `${date}T09:00:00`,
  services: [{ name: "Adventure Hike", scheduled_at: `${date}T09:00:00` }]
});

const pickupReservation = reservation({
  id: "1002",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Pick Up",
  services: [{ name: "Pick Up - Adventure Hike" }]
});

const beachReservation = reservation({
  id: "2001",
  animal_id: 77,
  a_name: "Mochi",
  a_o_first_name: "Alex",
  a_o_last_name: "Lee",
  type: "Beach Excursion",
  services: [{ name: "Beach Excursion", scheduled_at: `${date}T10:30:00` }]
});

const dropoffReservation = reservation({
  id: "2002",
  animal_id: 77,
  a_name: "Mochi",
  a_o_first_name: "Alex",
  a_o_last_name: "Lee",
  type: "Drop Off",
  services: [{ name: "Drop Off After Beach Excursion" }]
});

const daycareReservation = reservation({
  id: "3001",
  animal_id: 99,
  a_name: "Rex",
  a_o_first_name: "Sam",
  a_o_last_name: "Taylor",
  type: "Daycare Full Day",
  services: [{ name: "Daycare Full Day" }]
});

const duplicateHike = reservation({
  id: "1003",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Adventure Hike",
  services: [{ name: "Adventure Hike" }]
});

const merged = normalizeGingrRouteReservations(
  [hikeReservation, pickupReservation, beachReservation, dropoffReservation, daycareReservation, duplicateHike],
  date
);

assert.equal(merged.dogs.length, 2, "eligible dogs only — daycare excluded, same animal merged");
const biscuit = merged.dogs.find((d) => d.name === "Biscuit");
const mochi = merged.dogs.find((d) => d.name === "Mochi");
assert.ok(biscuit, "Biscuit should be present");
assert.ok(mochi, "Mochi should be present");
assert.equal(biscuit!.pickup, true, "pickup merges onto activity dog");
assert.equal(mochi!.dropoff, true, "dropoff merges onto activity dog");
assert.equal(biscuit!.activities.length, 1, "no duplicate activity ids");
assert.equal(biscuit!.activities[0], "adventure_hike");
assert.equal(mochi!.activities[0], "beach_excursion");
assert.ok(!merged.dogs.some((d) => d.name === "Rex"), "daycare-only dog excluded");

assert.equal(merged.stats.dogsScheduled, 2);
assert.equal(merged.stats.adventureHike, 1);
assert.equal(merged.stats.beachExcursion, 1);
assert.equal(merged.stats.transportationRequired, 2);

// --- todayPacificDateKey ---
assert.match(todayPacificDateKey(new Date("2026-08-31T12:00:00-07:00")), /^\d{4}-\d{2}-\d{2}$/);

// --- Cache / inflight ---
invalidateGingrRouteCache();
const cacheDate = "2026-09-01";
const samplePayload = {
  date: cacheDate,
  dogs: [],
  stats: {
    dogsScheduled: 0,
    adventureHike: 0,
    beachExcursion: 0,
    transportationRequired: 0
  },
  fetchedAt: new Date().toISOString(),
  cached: false
};

writeGingrRouteCache(cacheDate, samplePayload);
const cached = readGingrRouteCache(cacheDate);
assert.ok(cached, "cache read returns payload");
assert.equal(cached!.cached, true);
assert.equal(cached!.date, cacheDate);

let inflightCalls = 0;
void (async () => {
  const [first, second] = await Promise.all([
    withGingrRouteInflight("inflight-test", async () => {
      inflightCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { ...samplePayload, date: "inflight-test" };
    }),
    withGingrRouteInflight("inflight-test", async () => {
      inflightCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { ...samplePayload, date: "inflight-test" };
    })
  ]);
  assert.equal(inflightCalls, 1, "concurrent inflight requests share one loader");
  assert.equal(first.date, second.date);

  // --- Navigation wiring ---
  {
    const apps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["route_generator", "live_fleet"], {
      includeRouteGenerator: true
    });
    const labels = apps.sections.flatMap((s) => s.links.map((l) => l.label));
    assert.ok(labels.includes("Gingr Route Generator"), "Apps hub shows Gingr Route Generator with route access");
  }

  {
    const hidden = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["live_fleet"], {
      includeRouteGenerator: false
    });
    const labels = hidden.sections.flatMap((s) => s.links.map((l) => l.label));
    assert.ok(!labels.includes("Gingr Route Generator"), "hidden without route generator access");
  }

  const navWithRoute = appendAuthenticatedGlobalRoutes([], { includeRouteGenerator: true });
  assert.ok(
    navWithRoute.some((e) => e.type === "route" && e.id === "gingr-route-generator"),
    "sidebar Apps section includes Gingr Route Generator route leaf"
  );
  assert.equal(GINGR_ROUTE_GENERATOR_NAV_ROUTE.href, "/admin/gingr-route-generator");

  console.log("test-gingr-route-generator: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
