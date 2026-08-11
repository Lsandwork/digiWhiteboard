import assert from "node:assert/strict";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";
import { loadActiveDogsForGroomingPush } from "../lib/grooming-push-active-dogs";

const stubSupabase = {
  from() {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      }
    };
  }
} as never;

const originalFetch = globalThis.fetch;

async function main() {
  setCachedBackOfHouseBoard({
    source: "gingr_back_of_house",
    checking_in: [],
    checking_out: []
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/api\/v1\/reservations/);
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "res-900",
            animal_id: "501",
            animal: { id: "501", name: "Mochi", first_name: "Mochi" },
            owner: { first_name: "Alex", last_name: "Rivera" },
            type: "Daycare",
            check_in_stamp: "2026-08-10T15:00:00.000Z"
          },
          {
            id: "res-901",
            animal: { id: "502", name: "Pepper" },
            owner: { last_name: "Nguyen" },
            type: { name: "Grooming" },
            check_in_stamp: "2026-08-10T15:10:00.000Z"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  process.env.GINGR_API_KEY = process.env.GINGR_API_KEY || "test-key";

  const result = await loadActiveDogsForGroomingPush(stubSupabase, {
    gingrMode: "allow_fetch",
    forceRefresh: true
  });

  assert.equal(result.dogs.length, 2, "checked-in Gingr reservations must populate the picker");
  assert.ok(
    result.dogs.every((dog) => dog.group === "checked_in"),
    "reservation checked_in=true rows are Checked In"
  );
  assert.deepEqual(
    result.dogs.map((dog) => dog.dogName).sort(),
    ["Mochi", "Pepper"]
  );
  assert.equal(result.meta.source, "gingr_checked_in_reservations");
  assert.equal(result.meta.checked_in_reservation_rows, 2);

  console.log("grooming-push active dogs tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
