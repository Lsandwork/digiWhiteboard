import assert from "node:assert/strict";
import { loadFastBoardTransitions } from "../lib/board-fast-checkout";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";

const now = new Date();
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

/**
 * Permissive Supabase stub: every query resolves, so the assertions isolate the
 * board merge rather than the client. No Supabase rows exist for these dogs —
 * the whole point is that Gingr's back-of-house feed alone puts them on the board.
 */
function makeSupabaseStub() {
  return {
    from() {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        in: chain,
        not: chain,
        gte: chain,
        neq: chain,
        order: chain,
        limit: chain,
        update: chain,
        insert: chain,
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null })
      });
      return builder;
    }
  };
}

async function main() {
  const supabase = makeSupabaseStub() as unknown as Parameters<typeof loadFastBoardTransitions>[0];

  setCachedBackOfHouseBoard({
    checking_in: [
      {
        id: "res-501",
        animal_id: "animal-501",
        animal_name: "Rosie",
        owner_name: "Alvarez",
        check_in_stamp: secondsAgo(20),
        event_time: secondsAgo(20)
      },
      {
        // Checked in this morning — outside the display window, must stay off the board.
        id: "res-502",
        animal_id: "animal-502",
        animal_name: "Stale",
        check_in_stamp: secondsAgo(4 * 60 * 60),
        event_time: secondsAgo(4 * 60 * 60)
      }
    ],
    checking_out: [],
    source: "gingr_back_of_house"
  });

  const result = await loadFastBoardTransitions(supabase, now);
  const names = result.checking_in.map((dog) => dog.animal_name);

  assert.deepEqual(
    names,
    ["Rosie"],
    "a Gingr back-of-house check-in reaches the fast board with no webhook row"
  );

  setCachedBackOfHouseBoard({
    checking_in: [
      {
        id: "res-601",
        animal_id: "animal-601",
        animal_name: "Milo",
        owner_name: "Chen",
        check_in_stamp: secondsAgo(10),
        event_time: secondsAgo(10)
      }
    ],
    checking_out: [
      {
        id: "res-701",
        animal_id: "animal-701",
        animal_name: "Luna",
        owner_name: "Patel",
        event_time: secondsAgo(8)
      }
    ],
    source: "gingr_back_of_house"
  });

  const timedOutClient = {
    from() {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        in: chain,
        not: chain,
        gte: chain,
        neq: chain,
        order: chain,
        limit: chain,
        update: chain,
        insert: chain,
        then: (_resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          reject?.(new Error("fast-board live_transition_dogs timed out after 1500ms."))
      });
      return builder;
    }
  };

  const timedOut = await loadFastBoardTransitions(
    timedOutClient as unknown as Parameters<typeof loadFastBoardTransitions>[0],
    now
  );
  assert.equal(timedOut.supabase_timed_out, true);
  assert.deepEqual(
    timedOut.checking_in.map((dog) => dog.animal_name),
    ["Milo"],
    "a Supabase timeout must still paint the cached Gingr check-in"
  );
  assert.deepEqual(
    timedOut.checking_out.map((dog) => dog.animal_name),
    ["Luna"],
    "a Supabase timeout must still paint the cached Gingr basket checkout"
  );

  console.log("board fast gingr check-in checks passed");
}

void main();
