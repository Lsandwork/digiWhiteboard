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

  console.log("board fast gingr check-in checks passed");
}

void main();
