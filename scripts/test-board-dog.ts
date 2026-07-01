import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { resolveBoardDirection } from "../lib/board-dog";
import { normalizeBoardDog } from "../lib/board-dog";

loadEnvConfig(process.cwd());

assert.equal(
  resolveBoardDirection({ record: { status_string: "Checking In Soon" }, direction: null }),
  "checking_in"
);
assert.equal(
  resolveBoardDirection({ record: { status_string: "Checking Out Soon" }, direction: null }),
  "checking_out"
);

const gingrRecord = {
  id: "953",
  animal_id: "115",
  a_first: "Maggie",
  o_last: "Holbrook",
  type: "Daycare | Full Day",
  area_name: "Front Desk",
  event_time: 1559696400,
  status_string: "Checking In Soon"
};

const normalized = normalizeBoardDog({
  record: gingrRecord,
  direction: "checking_in",
  reservation_id: gingrRecord.id,
  animal_id: gingrRecord.animal_id,
  event_timestamp: gingrRecord.event_time
});

assert.equal(normalized.animal_name, "Maggie");
assert.equal(normalized.owner_name, "Holbrook");
assert.equal(normalized.gingr_reservation_id, "953");
assert.equal(normalized.room, "Front Desk");

console.log("board-dog checks passed");
