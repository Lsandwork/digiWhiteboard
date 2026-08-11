import assert from "node:assert/strict";
import { fetchCurrentlyCheckedInDogsRobust, todayInLosAngeles } from "../lib/gingr-checked-in-dogs";

const originalFetch = globalThis.fetch;

async function main() {
  assert.match(todayInLosAngeles(new Date("2026-08-11T07:00:00.000Z")), /^\d{4}-\d{2}-\d{2}$/);

  // 00:30 UTC on Aug 11 is still Aug 10 in America/Los_Angeles.
  const lateUtc = new Date("2026-08-11T00:30:00.000Z");
  assert.equal(todayInLosAngeles(lateUtc), "2026-08-10");

  let sawCheckedInTrueWithoutDates = false;
  let sawPacificDate = false;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body || "");
    if (body.includes("checked_in=true") && !body.includes("start_date")) {
      sawCheckedInTrueWithoutDates = true;
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (body.includes("checked_in=true") && body.includes("start_date=2026-08-10")) {
      sawPacificDate = true;
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "r1",
              animal: { id: "9", name: "Coop" },
              owner: { last_name: "Smith" },
              check_in_date: "2026-08-10",
              type: "Daycare"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (body.includes("checked_in=false") && body.includes("start_date=2026-08-10")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "r1",
              animal: { id: "9", name: "Coop" },
              owner: { last_name: "Smith" },
              check_in_date: "2026-08-10",
              type: "Daycare"
            },
            {
              id: "r2",
              animal: { id: "10", name: "NotIn" },
              status: "Confirmed"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  process.env.GINGR_API_KEY = process.env.GINGR_API_KEY || "test-key";

  const result = await fetchCurrentlyCheckedInDogsRobust({
    force: true,
    now: lateUtc
  });

  assert.equal(sawCheckedInTrueWithoutDates, true, "must query checked_in=true without UTC date trap");
  assert.equal(sawPacificDate, true, "fallback must use Pacific business date");
  assert.equal(result.dogs.length, 1);
  assert.equal(result.dogs[0]?.dogName, "Coop");
  assert.equal(result.meta.todayLa, "2026-08-10");

  console.log("gingr checked-in dogs tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
