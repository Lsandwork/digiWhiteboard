import assert from "node:assert/strict";
import { CROSSOVER_TEMPLATES } from "../lib/staff/admin-ops";
import {
  buildMessageFromTemplate,
  extractCustomPlaceholdersFromEdit,
  resolveCrossoverMessage,
  type CrossoverTemplateFields
} from "../lib/staff/crossover-templates";

const routeLateTemplate = CROSSOVER_TEMPLATES[0].message;
const emptyFields: CrossoverTemplateFields = {
  dog: "",
  trafficWeatherIssue: "",
  route: "",
  assignedTo: "",
  toDepartment: "Daycare",
  fromDepartment: "Front Desk"
};

assert.equal(
  buildMessageFromTemplate(routeLateTemplate, emptyFields),
  routeLateTemplate
);

const filledFields: CrossoverTemplateFields = {
  dog: "Cooper",
  trafficWeatherIssue: "heavy traffic",
  route: "Route 3",
  assignedTo: "Brian",
  toDepartment: "Daycare",
  fromDepartment: "Transportation"
};

assert.match(
  buildMessageFromTemplate(routeLateTemplate, filledFields),
  /because of heavy traffic/
);

assert.match(
  buildMessageFromTemplate(routeLateTemplate, filledFields),
  /Heads up — Route 3 is about \[X\] min behind/
);

const dogTemplate = CROSSOVER_TEMPLATES[1].message;
assert.equal(
  buildMessageFromTemplate(dogTemplate, { ...emptyFields, dog: "Atlas" }),
  dogTemplate.replace("[Dog]", "Atlas")
);

const departmentTemplate = CROSSOVER_TEMPLATES[8].message;
assert.match(
  buildMessageFromTemplate(departmentTemplate, { ...filledFields, route: "Route 2" }),
  /Route 2 is \[X\] min out with Cooper/
);

const custom = extractCustomPlaceholdersFromEdit(
  routeLateTemplate,
  "Heads up — Route 3 is about 15 min behind because of [traffic/weather/issue]. Pickups done: [list or none]. Still out: [list]. Yard + front desk — adjust timing and flag any owners we might cut close on.",
  { ...filledFields, route: "Route 3" }
);
assert.equal(custom.X, "15");

const rebuilt = buildMessageFromTemplate(routeLateTemplate, { ...filledFields, route: "Route 3" }, custom);
assert.match(rebuilt, /about 15 min behind/);
assert.match(rebuilt, /Route 3 is about 15/);

const resolved = resolveCrossoverMessage(routeLateTemplate, {
  dog: "Cooper",
  trafficWeatherIssue: "rain",
  route: "",
  assignedTo: "Lonnie",
  toDepartment: "Daycare",
  fromDepartment: "Front Desk"
}, "Route Running Late");
assert.match(resolved, /Heads up — Lonnie is about/);
assert.match(resolved, /because of rain/);
assert.doesNotMatch(resolved, /\[Route\/Handler\]/);
assert.doesNotMatch(resolved, /\[traffic\/weather\/issue\]/);

console.log("crossover template autofill tests passed");
