import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCastDisplaySchedulePhase,
  isCastDisplayMorningOpenWindow,
  isCastDisplayOpenHours
} from "../lib/remote-cast/hours";

function atPacificParts(year: number, month: number, day: number, hour: number, minute = 0) {
  // Construct a UTC instant that maps to the desired Pacific wall-clock via iterative adjustment.
  // month is 1-based for readability.
  const guess = new Date(Date.UTC(year, month - 1, day, hour + 8, minute, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(guess).map((part) => [part.type, part.value]));
    const gotHour = Number(parts.hour);
    const gotMinute = Number(parts.minute);
    const gotDay = Number(parts.day);
    const deltaMinutes = (hour - gotHour) * 60 + (minute - gotMinute) + (day - gotDay) * 24 * 60;
    if (deltaMinutes === 0) break;
    guess.setUTCMinutes(guess.getUTCMinutes() + deltaMinutes);
  }
  return guess;
}

const beforeOpen = atPacificParts(2026, 7, 13, 5, 0);
const almostOpen = atPacificParts(2026, 7, 13, 5, 29);
const openMorning = atPacificParts(2026, 7, 13, 5, 30);
const openAfternoon = atPacificParts(2026, 7, 13, 14, 30);
const nearClose = atPacificParts(2026, 7, 13, 21, 59);
const closedNight = atPacificParts(2026, 7, 13, 22, 0);
const closedLate = atPacificParts(2026, 7, 14, 2, 0);
const sundayOpen = atPacificParts(2026, 7, 12, 9, 0); // Sunday

assert.equal(isCastDisplayOpenHours(beforeOpen), false, "5:00 AM is still closed");
assert.equal(isCastDisplayOpenHours(almostOpen), false, "5:29 AM is still closed");
assert.equal(isCastDisplayOpenHours(openMorning), true, "5:30 AM opens");
assert.equal(isCastDisplayOpenHours(openAfternoon), true);
assert.equal(isCastDisplayOpenHours(nearClose), true);
assert.equal(isCastDisplayOpenHours(closedNight), false, "10:00 PM closes");
assert.equal(isCastDisplayOpenHours(closedLate), false);
assert.equal(isCastDisplayOpenHours(sundayOpen), true, "runs 7 days a week");

assert.equal(getCastDisplaySchedulePhase(openAfternoon), "open");
assert.equal(getCastDisplaySchedulePhase(closedNight), "closed");

assert.equal(isCastDisplayMorningOpenWindow(openMorning), true);
assert.equal(isCastDisplayMorningOpenWindow(atPacificParts(2026, 7, 13, 5, 44)), true);
assert.equal(isCastDisplayMorningOpenWindow(atPacificParts(2026, 7, 13, 5, 45)), false);
assert.equal(isCastDisplayMorningOpenWindow(beforeOpen), false);
assert.equal(isCastDisplayMorningOpenWindow(openAfternoon), false);

{
  const cron = readFileSync(join(process.cwd(), "app/api/cron/tl-digi-board-sync/route.ts"), "utf8");
  assert.match(cron, /isCastDisplayOpenHours/);
  assert.match(cron, /skipped:\s*true/);

  const schedule = readFileSync(join(process.cwd(), "lib/remote-cast/schedule.ts"), "utf8");
  assert.match(schedule, /tl_alerts_reminders/);

  const gate = readFileSync(join(process.cwd(), "components/display/DisplayClosedHoursGate.tsx"), "utf8");
  assert.match(gate, /DisplayClosedHoursGate/);
  assert.match(gate, /isCastDisplayOpenHours/);
}

console.log("cast display schedule hours: ok");
