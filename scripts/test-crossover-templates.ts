import assert from "node:assert/strict";
import { CROSSOVER_TEMPLATES } from "../lib/staff/admin-ops";
import {
  buildMessageFromTemplate,
  extractCustomPlaceholdersFromEdit,
  getTemplateFields,
  resolveCrossoverMessage
} from "../lib/staff/crossover-templates";

const routeLate = CROSSOVER_TEMPLATES[0];
const dogEyes = CROSSOVER_TEMPLATES[1];
const healthWatch = CROSSOVER_TEMPLATES[3];

assert.equal(getTemplateFields("Route Running Late").length, 5);
assert.equal(getTemplateFields("Dog Needs Extra Eyes").find((field) => field.key === "demeanor")?.type, "select");
assert.equal(getTemplateFields("Health Watch").find((field) => field.key === "owner_status")?.type, "select");

const routeValues = {
  route: "Route 3",
  minutes: "15",
  delay_reason: "traffic",
  pickups_done: "Cooper",
  still_out: "Atlas, Brody"
};

const routeMessage = buildMessageFromTemplate(routeLate.message, routeLate.title, routeValues, {
  toDepartment: "Daycare",
  fromDepartment: "Front Desk"
});

assert.match(routeMessage, /Route 3 is about 15 min behind because of traffic/);
assert.match(routeMessage, /Pickups done: Cooper/);
assert.match(routeMessage, /Still out: Atlas, Brody/);
assert.doesNotMatch(routeMessage, /\[/);

const dogValues = {
  dog: "Milo",
  demeanor: "overstimulated",
  time: "2:15 PM",
  trigger: "fence line barking",
  handling_tip: "give space, slow leash work"
};

const dogMessage = buildMessageFromTemplate(dogEyes.message, dogEyes.title, dogValues, {
  toDepartment: "Daycare",
  fromDepartment: "Front Desk"
});
assert.match(dogMessage, /Milo had a overstimulated moment on yard at 2:15 PM/);

const healthValues = {
  dog: "Nova",
  symptom: "loose stool",
  time: "11:00 AM",
  owner_status: "not called yet",
  escalation: "vomiting or lethargy"
};

const healthMessage = buildMessageFromTemplate(healthWatch.message, healthWatch.title, healthValues, {
  toDepartment: "Daycare",
  fromDepartment: "Front Desk"
});
assert.match(healthMessage, /Flagging Nova for the shift: loose stool noticed at 11:00 AM/);
assert.match(healthMessage, /Owner not called yet/);

const custom = extractCustomPlaceholdersFromEdit(
  routeLate.message,
  "Heads up — Route 3 is about 15 min behind because of traffic. Pickups done: none. Still out: [list]. Yard + front desk — adjust timing and flag any owners we might cut close on.",
  routeLate.title,
  { route: "Route 3", minutes: "15", delay_reason: "traffic", pickups_done: "none" },
  { toDepartment: "Daycare", fromDepartment: "Front Desk" }
);
assert.equal(custom.list, undefined);

const resolved = resolveCrossoverMessage(
  routeLate.message,
  routeLate.title,
  { route: "", minutes: "10", delay_reason: "weather", pickups_done: "none", still_out: "none" },
  { toDepartment: "Daycare", fromDepartment: "Front Desk" }
);
assert.match(resolved, /because of weather/);

console.log("smart crossover template tests passed");
