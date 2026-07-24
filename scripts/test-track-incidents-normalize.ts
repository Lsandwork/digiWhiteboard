import assert from "node:assert/strict";
import { buildIncidentNumber, normalizeGingrIncidentPayload } from "../lib/staff/track-incidents/normalize";
import { isPacificFiveAm } from "../lib/staff/track-incidents/sync";

assert.equal(buildIncidentNumber("788", "2026-07-09T08:34:11.300Z"), "INC-2026-788");

const normalized = normalizeGingrIncidentPayload({
  webhook_type: "incident_created",
  entity_id: "788",
  entity_type: "incident",
  entity_data: {
    id: "788",
    animal_name: "Riley",
    animal_id: "100",
    first_name: "Alex",
    last_name: "Smith",
    type: "Dog Scuffle",
    incident_type_id: "3",
    created_by: "Alyssa B.",
    username: "alyssa",
    notes: "Monitored",
    location_name: "Fitdog Northside",
    location_id: "1",
    created_at_iso: "2026-07-09T08:34:11.300Z",
    o_id: "55",
    a_id: "100"
  }
});

assert.ok(normalized);
assert.equal(normalized!.dog_name, "Riley");
assert.equal(normalized!.owner_name, "Alex Smith");
assert.equal(normalized!.incident_type, "Dog Scuffle");
assert.equal(normalized!.incident_number, "INC-2026-788");

assert.equal(normalizeGingrIncidentPayload({ entity_id: "codex-test", entity_data: {} }), null);

// Smoke: function is callable (value depends on wall clock; just ensure boolean).
assert.equal(typeof isPacificFiveAm(), "boolean");

console.log("track incidents normalize: ok");
