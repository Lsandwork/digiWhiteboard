import assert from "node:assert/strict";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";
import { loadActiveDogsForGroomingPush } from "../lib/grooming-push-active-dogs";

// Minimal stub supabase that returns no live rows.
const stubSupabase = {
  from() {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      }
    };
  }
} as never;

setCachedBackOfHouseBoard({
  source: "gingr_back_of_house",
  checking_in: [
    {
      id: "res-1",
      animal_id: "101",
      a_first: "Lila",
      o_last: "Miller",
      type: "Overnight: Den",
      status_string: "Confirmed",
      start_date: new Date().toISOString()
    },
    {
      id: "res-2",
      animal_id: "102",
      a_first: "Buddy",
      o_last: "Jones",
      type: "Daycare",
      status_string: "Checked In",
      check_in_stamp: new Date().toISOString(),
      start_date: new Date().toISOString()
    }
  ],
  checking_out: []
});

async function main() {
  const result = await loadActiveDogsForGroomingPush(stubSupabase, { gingrMode: "cache_only" });
  assert.ok(result.dogs.length >= 2, "cache_only should return reservation + checked-in dogs");
  assert.ok(
    result.dogs.some((dog) => dog.status === "reservation" || dog.group === "reservations"),
    "expected reservation dogs must be included"
  );
  assert.ok(
    result.dogs.some((dog) => dog.status === "checked_in" || dog.group === "checked_in"),
    "checked-in dogs must still be included"
  );
  assert.equal(result.meta.gingr_mode, "cache_only");
  console.log("expected-dogs-cache-only tests passed");
}

void main();
