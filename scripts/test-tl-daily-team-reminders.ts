/**
 * Daily Team Reminders visibility on the TL Alerts whiteboard.
 * Unique incomplete Additional Service dogs — not service row count.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TL_DAILY_TEAM_REMINDERS,
  TL_DAILY_TEAM_REMINDERS_MAX_UNIQUE_DOGS,
  countUniqueAdditionalServiceDogs,
  shouldShowDailyTeamReminders,
  shouldShowDailyTeamRemindersForServices
} from "../lib/tl-digi-board/daily-team-reminders";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function row(gingrAnimalId: string) {
  return { gingrAnimalId };
}

assert.equal(TL_DAILY_TEAM_REMINDERS_MAX_UNIQUE_DOGS, 5);
assert.deepEqual([...TL_DAILY_TEAM_REMINDERS], [
  "Body checks: AM / Midday / PM",
  "Engage with the dogs",
  "No phones on yard",
  "Make sure to check Walk Board",
  "Upload Photos & Report Cards",
  "Update the team log"
]);
assert.ok(!TL_DAILY_TEAM_REMINDERS.some((item) => /Wallboard|dryer door/i.test(item)));

{
  assert.equal(shouldShowDailyTeamReminders(0), true);
  assert.equal(shouldShowDailyTeamReminders(1), true);
  assert.equal(shouldShowDailyTeamReminders(5), true);
  assert.equal(shouldShowDailyTeamReminders(6), false);
  assert.equal(shouldShowDailyTeamReminders(20), false);
}

{
  assert.equal(countUniqueAdditionalServiceDogs([]), 0);
  assert.equal(shouldShowDailyTeamRemindersForServices([]), true);
}

{
  const oneDog = [row("a1"), row("a1"), row("a1"), row("a1"), row("a1"), row("a1")];
  assert.equal(countUniqueAdditionalServiceDogs(oneDog), 1);
  assert.equal(shouldShowDailyTeamRemindersForServices(oneDog), true);
}

{
  const fiveDogs = [row("1"), row("2"), row("3"), row("4"), row("5"), row("5"), row("5")];
  assert.equal(countUniqueAdditionalServiceDogs(fiveDogs), 5);
  assert.equal(shouldShowDailyTeamRemindersForServices(fiveDogs), true);
}

{
  const sixDogs = [row("1"), row("2"), row("3"), row("4"), row("5"), row("6")];
  assert.equal(countUniqueAdditionalServiceDogs(sixDogs), 6);
  assert.equal(shouldShowDailyTeamRemindersForServices(sixDogs), false);
}

{
  const twenty = Array.from({ length: 20 }, (_, i) => row(`dog-${i}`));
  assert.equal(countUniqueAdditionalServiceDogs(twenty), 20);
  assert.equal(shouldShowDailyTeamRemindersForServices(twenty), false);
}

{
  const board = source("components/boards/TlAlertsRemindersBoard.tsx");
  assert.match(board, /Daily Team Reminders/);
  assert.match(board, /shouldShowDailyTeamRemindersForServices/);
  assert.match(board, /TL_DAILY_TEAM_REMINDERS/);
  assert.doesNotMatch(board, /Package Group Walks/);
  assert.doesNotMatch(board, /package-group-walks/);
  assert.doesNotMatch(board, /Package Group Walk eligibility/);
  assert.doesNotMatch(board, /Wallboard/);
  assert.doesNotMatch(board, /Keep dryer door closed/);
}

{
  const css = source("components/boards/tl-alerts-reminders-board.css");
  assert.match(css, /tl-board__stack--services-expanded/);
  assert.match(css, /tl-team-reminders/);
  assert.doesNotMatch(css, /Package Group Walks/);
}

console.log("test-tl-daily-team-reminders: all assertions passed");
