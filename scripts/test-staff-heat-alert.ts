import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatTempF,
  HEAT_ALERT_TEMP_F,
  isHeatAlertTemp,
  pacificDateKey
} from "../lib/staff/santa-monica-weather";
import { shouldSkipHeatAlertPush } from "../lib/staff/heat-alert";
import type { StaffPushNotice } from "../lib/staff/push-notices";

assert.equal(HEAT_ALERT_TEMP_F, 80);
assert.equal(isHeatAlertTemp(79.9), false);
assert.equal(isHeatAlertTemp(80), true);
assert.equal(isHeatAlertTemp(95), true);
assert.equal(formatTempF(72.4), "72°F");
assert.match(pacificDateKey(new Date("2026-08-30T05:00:00.000Z")), /^\d{4}-\d{2}-\d{2}$/);

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

const weatherRoute = readFileSync(join(root, "app/api/staff/weather/route.ts"), "utf8");
assert.match(weatherRoute, /fetchSantaMonicaWeather/);

const cron = readFileSync(join(root, "app/api/cron/heat-alert/route.ts"), "utf8");
assert.match(cron, /evaluateAndPushHeatAlert/);
assert.match(cron, /isAuthorizedCron/);

const vercel = readFileSync(join(root, "vercel.json"), "utf8");
assert.match(vercel, /\/api\/cron\/heat-alert/);

const sms = readFileSync(join(root, "lib/staff/super-admin-sms.ts"), "utf8");
assert.match(sms, /Heat Alert/);
assert.match(sms, /heat_alert/);

console.log("staff heat alert / weather tests passed");
