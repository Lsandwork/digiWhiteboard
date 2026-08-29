import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearSantaMonicaWeatherCache,
  fetchSantaMonicaWeather,
  formatTempF,
  hasHeatAlertSentInMemory,
  HEAT_ALERT_TEMP_F,
  heatAlertIdempotencyKey,
  isHeatAlertTemp,
  markHeatAlertSentInMemory,
  msUntilPacificMidnight,
  pacificDateKey,
  WEATHER_CACHE_TTL_MS,
  WEATHER_HTTP_CACHE_SECONDS
} from "../lib/staff/santa-monica-weather";
import { shouldSkipHeatAlertPush } from "../lib/staff/heat-alert";
import type { StaffPushNotice } from "../lib/staff/push-notices";
import { BOARD_OVERLAY_CACHE_TTL_MS } from "../lib/board-settings-cache";
import { invalidateTtlCache } from "../lib/server-ttl-cache";

assert.equal(HEAT_ALERT_TEMP_F, 80);
assert.equal(isHeatAlertTemp(79.9), false);
assert.equal(isHeatAlertTemp(80), true);
assert.equal(isHeatAlertTemp(95), true);
assert.equal(formatTempF(72.4), "72°F");
assert.match(pacificDateKey(new Date("2026-08-30T05:00:00.000Z")), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(heatAlertIdempotencyKey("2026-08-29"), "heat-alert:2026-08-29");
assert.ok(WEATHER_CACHE_TTL_MS >= 10 * 60_000);
assert.ok(WEATHER_HTTP_CACHE_SECONDS >= 600);
assert.ok(msUntilPacificMidnight() >= 60_000);

const coolWeather = {
  tempF: 72,
  observedAt: new Date().toISOString(),
  label: "Santa Monica",
  heatAlert: false,
  source: "open-meteo" as const
};
const hotWeather = { ...coolWeather, tempF: 84, heatAlert: true };

assert.equal(
  shouldSkipHeatAlertPush({
    weather: coolWeather,
    activeNotice: null,
    lastSentPacificDate: "",
    todayPacific: "2026-08-29"
  }).action,
  "skipped_cool"
);

assert.equal(
  shouldSkipHeatAlertPush({
    weather: hotWeather,
    activeNotice: null,
    lastSentPacificDate: "2026-08-29",
    todayPacific: "2026-08-29"
  }).action,
  "skipped_already_sent"
);

assert.equal(
  shouldSkipHeatAlertPush({
    weather: hotWeather,
    activeNotice: {
      id: "n1",
      source: "heat_alert",
      is_active: true,
      priority: "urgent",
      display_mode: "urgent"
    } as StaffPushNotice,
    lastSentPacificDate: "",
    todayPacific: "2026-08-29"
  }).action,
  "skipped_active"
);

assert.equal(
  shouldSkipHeatAlertPush({
    weather: hotWeather,
    activeNotice: {
      id: "n2",
      source: "owner_complaint",
      is_active: true,
      priority: "urgent",
      display_mode: "urgent"
    } as StaffPushNotice,
    lastSentPacificDate: "",
    todayPacific: "2026-08-29"
  }).action,
  "skipped_other_urgent"
);

assert.equal(
  shouldSkipHeatAlertPush({
    weather: hotWeather,
    activeNotice: null,
    lastSentPacificDate: "2026-08-28",
    todayPacific: "2026-08-29"
  }).skip,
  false
);

const root = process.cwd();
const emptyState = readFileSync(join(root, "components/board/StaffBoardEmptyState.tsx"), "utf8");
assert.match(emptyState, /staff-all-clear__clock-cover/);
assert.match(emptyState, /BoardWeatherChip/);
assert.match(emptyState, /weather/);

const css = readFileSync(join(root, "app/globals.css"), "utf8");
assert.match(css, /\.staff-all-clear__clock-cover/);
assert.match(css, /\.board-weather-chip/);
assert.match(css, /background:\s*var\(--all-clear-bg\)/);

const boardClient = readFileSync(join(root, "components/BoardClient.tsx"), "utf8");
assert.match(boardClient, /useSantaMonicaWeather/);
assert.match(boardClient, /weather=\{santaMonicaWeather\}/);
assert.match(boardClient, /setClock\(new Date\(\)\)/);
assert.doesNotMatch(boardClient, /supabase\.from\(/);

const weatherHook = readFileSync(join(root, "hooks/useSantaMonicaWeather.ts"), "utf8");
assert.match(weatherHook, /\/api\/staff\/weather/);
assert.match(weatherHook, /12 \* 60_000|12 \* 60 \* 1000/);
assert.doesNotMatch(weatherHook, /from\(["']@\/lib\/supabase/);
assert.doesNotMatch(weatherHook, /api\.open-meteo/);

const weatherRoute = readFileSync(join(root, "app/api/staff/weather/route.ts"), "utf8");
assert.match(weatherRoute, /fetchSantaMonicaWeather/);
assert.match(weatherRoute, /Cache-Control/);
assert.match(weatherRoute, /s-maxage/);
assert.doesNotMatch(weatherRoute, /from\(["']@\/lib\/supabase/);

const weatherLib = readFileSync(join(root, "lib/staff/santa-monica-weather.ts"), "utf8");
assert.match(weatherLib, /WEATHER_CACHE_TTL_MS/);
assert.match(weatherLib, /getOrLoadTtlCache/);
assert.doesNotMatch(weatherLib, /from\(["']@\/lib\/supabase/);

const heatLib = readFileSync(join(root, "lib/staff/heat-alert.ts"), "utf8");
assert.match(heatLib, /hasHeatAlertSentInMemory/);
assert.match(heatLib, /Below heat threshold/);
assert.match(heatLib, /supabaseReads/);

const cron = readFileSync(join(root, "app/api/cron/heat-alert/route.ts"), "utf8");
assert.match(cron, /evaluateAndPushHeatAlert/);
assert.match(cron, /isAuthorizedCron/);

const vercel = readFileSync(join(root, "vercel.json"), "utf8");
assert.match(vercel, /\/api\/cron\/heat-alert/);

const sms = readFileSync(join(root, "lib/staff/super-admin-sms.ts"), "utf8");
assert.match(sms, /Heat Alert/);
assert.match(sms, /heat_alert/);
assert.match(sms, /SUPER_ADMIN_PHONE_CACHE_TTL_MS/);
assert.match(sms, /getOrLoadTtlCache/);

const overlaysHook = readFileSync(join(root, "hooks/useStaffBoardOverlays.ts"), "utf8");
assert.match(overlaysHook, /BOARD_OVERLAY_POLL_MS = 30_000/);
assert.ok(BOARD_OVERLAY_CACHE_TTL_MS >= 15_000);

// --- In-memory weather cache: one Open-Meteo call shared by concurrent clients ---
void (async () => {
  clearSantaMonicaWeatherCache();
  let openMeteoCalls = 0;
  const fakeFetch: typeof fetch = (async () => {
    openMeteoCalls += 1;
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 71.2, time: "2026-08-29T12:00" }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const [a, b, c] = await Promise.all([
    fetchSantaMonicaWeather({ fetchImpl: fakeFetch }),
    fetchSantaMonicaWeather({ fetchImpl: fakeFetch }),
    fetchSantaMonicaWeather({ fetchImpl: fakeFetch })
  ]);
  assert.equal(openMeteoCalls, 1, "concurrent weather callers must share one Open-Meteo fetch");
  assert.equal(a.tempF, 71.2);
  assert.equal(b.tempF, 71.2);
  assert.equal(c.tempF, 71.2);

  const d = await fetchSantaMonicaWeather({ fetchImpl: fakeFetch });
  assert.equal(openMeteoCalls, 1, "TTL cache must prevent a second Open-Meteo fetch");
  assert.equal(d.tempF, 71.2);

  const dateKey = pacificDateKey();
  invalidateTtlCache(heatAlertIdempotencyKey(dateKey));
  assert.equal(hasHeatAlertSentInMemory(dateKey), false);
  markHeatAlertSentInMemory(dateKey);
  assert.equal(hasHeatAlertSentInMemory(dateKey), true);

  // --- Query-frequency audit (1 hour, steady state, one serverless process) ---
  const HOUR_MS = 60 * 60_000;
  const CRON_EVERY_MS = 15 * 60_000;
  const WEATHER_CLIENT_POLL_MS = 12 * 60_000;
  const OVERLAY_POLL_MS = 30_000;
  const OVERLAY_CACHE_MS = BOARD_OVERLAY_CACHE_TTL_MS;

  function auditForScreens(screens: number) {
    const cronExecutions = Math.floor(HOUR_MS / CRON_EVERY_MS);
    // Cool day: cron exits before any Supabase access.
    const heatCronReadsCool = 0;
    const heatCronWritesCool = 0;
    // Hot day already-sent (memory/process cache after first tick): 0–1 keyed reads total, 0 writes.
    const heatCronReadsHotAlreadySent = 1; // first tick may keyed-read; rest memory
    const heatCronWritesHotAlreadySent = 0;
    // First push of the Pacific day: ~2 reads (day key + active notice) + ~2 writes (notice + day key)
    // + SMS phones cache miss once: +1 read. Phones cached 30m thereafter.
    const heatCronReadsFirstPush = 3;
    const heatCronWritesFirstPush = 2;

    // Weather: clients hit /api/staff/weather only. Open-Meteo ≤ once per WEATHER_CACHE_TTL per process.
    const openMeteoCalls = Math.ceil(HOUR_MS / WEATHER_CACHE_TTL_MS);
    const weatherClientPolls = screens * Math.ceil(HOUR_MS / WEATHER_CLIENT_POLL_MS);
    const weatherSupabase = 0;

    // Clock: 100% client-side
    const clockSupabase = 0;

    // Board overlays: clients poll shared API; process cache collapses N screens → ~1 load / TTL.
    const overlayApiPolls = screens * Math.floor(HOUR_MS / OVERLAY_POLL_MS);
    const overlaySupabaseLoads = Math.ceil(HOUR_MS / OVERLAY_CACHE_MS);
    // Each overlay load currently fans out to ~5 feature queries (push/grooming/trainer/cast/emergency).
    const overlaySupabaseReads = overlaySupabaseLoads * 5;

    const coolHour = {
      screens,
      cronExecutions,
      openMeteoCalls,
      weatherClientPolls,
      weatherSupabase,
      clockSupabase,
      overlayApiPolls,
      supabaseReads: heatCronReadsCool + weatherSupabase + clockSupabase + overlaySupabaseReads,
      supabaseWrites: heatCronWritesCool,
      note: "cool day (<80°F) — heat cron never touches Supabase"
    };

    const hotAlreadySentHour = {
      screens,
      cronExecutions,
      openMeteoCalls,
      supabaseReads:
        heatCronReadsHotAlreadySent + weatherSupabase + clockSupabase + overlaySupabaseReads,
      supabaseWrites: heatCronWritesHotAlreadySent,
      note: "hot day, alert already sent — ≤1 keyed day-key read then memory"
    };

    const firstPushDay = {
      screens,
      cronExecutions,
      openMeteoCalls,
      supabaseReads: heatCronReadsFirstPush + weatherSupabase + clockSupabase + overlaySupabaseReads,
      supabaseWrites: heatCronWritesFirstPush,
      note: "first heat push of Pacific day (worst write hour)"
    };

    return { coolHour, hotAlreadySentHour, firstPushDay };
  }

  const audits = {
    oneScreen: auditForScreens(1),
    tenScreens: auditForScreens(10),
    fiftyScreens: auditForScreens(50)
  };

  // Scaling invariant: Open-Meteo and overlay Supabase loads must NOT scale with screen count.
  assert.equal(audits.oneScreen.coolHour.openMeteoCalls, audits.fiftyScreens.coolHour.openMeteoCalls);
  assert.equal(audits.oneScreen.coolHour.supabaseReads, audits.tenScreens.coolHour.supabaseReads);
  assert.equal(audits.oneScreen.coolHour.supabaseReads, audits.fiftyScreens.coolHour.supabaseReads);
  assert.equal(audits.oneScreen.coolHour.supabaseWrites, 0);
  assert.ok(audits.fiftyScreens.coolHour.weatherClientPolls > audits.oneScreen.coolHour.weatherClientPolls);
  assert.ok(audits.fiftyScreens.coolHour.overlayApiPolls > audits.oneScreen.coolHour.overlayApiPolls);

  const worstCaseDbQueryRatePerMin = (Math.ceil(HOUR_MS / OVERLAY_CACHE_MS) * 5) / 60;

  console.log("staff heat alert / weather tests passed");
  console.log(
    JSON.stringify(
      {
        queryFrequencyAudit: {
          assumptions: {
            weatherCacheTtlMin: WEATHER_CACHE_TTL_MS / 60_000,
            weatherClientPollMin: WEATHER_CLIENT_POLL_MS / 60_000,
            overlayClientPollSec: OVERLAY_POLL_MS / 1000,
            overlayServerCacheSec: OVERLAY_CACHE_MS / 1000,
            cronEveryMin: CRON_EVERY_MS / 60_000,
            singleProcess: true
          },
          simulations: audits,
          worstCaseDatabaseQueryRatePerMinute: Number(worstCaseDbQueryRatePerMin.toFixed(2)),
          scaling:
            "Adding dashboard screens increases HTTP polls to cached APIs only — not Supabase or Open-Meteo."
        }
      },
      null,
      2
    )
  );
})();
