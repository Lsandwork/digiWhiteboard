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

const checkedInPayload = {
  data: [
    {
      id: "res-900",
      animal_id: "501",
      animal: { id: "501", name: "Mochi" },
      owner: { first_name: "Alex", last_name: "Rivera" },
      type: "Daycare",
      check_in_stamp: "2026-08-10T15:00:00.000Z"
    },
    {
      id: "res-901",
      a_first: "Pepper",
      a_id: "502",
      o_last: "Nguyen",
      type: { name: "Grooming" },
      check_in_date: "2026-08-10"
    },
    {
      id: "res-902",
      animal: { id: "503", name: "Cooper" },
      owner: { last_name: "Cole" },
      type: "Daycare",
      status: "Checked In",
      check_in_stamp: "2026-08-10T16:00:00.000Z"
    }
  ]
};

async function main() {
  setCachedBackOfHouseBoard({
    source: "gingr_back_of_house",
    checking_in: [],
    checking_out: []
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/api\/v1\/reservations/);
    return new Response(JSON.stringify(checkedInPayload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  process.env.GINGR_API_KEY = process.env.GINGR_API_KEY || "test-key";

  const result = await loadActiveDogsForGroomingPush(stubSupabase, {
    gingrMode: "allow_fetch",
    forceRefresh: true
  });

  assert.ok(result.dogs.length >= 3, "checked-in Gingr reservations must populate the picker");
  assert.ok(
    result.dogs.some((dog) => /cooper/i.test(dog.dogName)),
    "Cooper must appear for grooming push search"
  );
  assert.ok(
    result.dogs.some((dog) => /pepper/i.test(dog.dogName)),
    "a_first-only Gingr rows must parse"
  );
  assert.equal(result.meta.source, "gingr_checked_in_reservations");
  assert.ok(Number(result.meta.checked_in_reservation_rows) >= 3);

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
