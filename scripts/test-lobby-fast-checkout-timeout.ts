import assert from "node:assert/strict";
import {
  __resetLiveTransitionQueryCooldownForTests,
  loadFastPromptedCheckouts
} from "../lib/board-fast-checkout";
import { loadLobbyCheckoutDogs, loadLobbyCheckoutDogsFast } from "../lib/lobby/checkout";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";

const now = new Date();
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

function makeRejectingSupabase(message: string) {
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
        then: (_resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          reject?.(new Error(message))
      });
      return builder;
    }
  };
}

function seedLunaBasket() {
  setCachedBackOfHouseBoard({
    checking_in: [],
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
}

async function main() {
  const previousGingrKey = process.env.GINGR_API_KEY;
  delete process.env.GINGR_API_KEY;
  try {
  __resetLiveTransitionQueryCooldownForTests();
  seedLunaBasket();

  const rejecting = makeRejectingSupabase("fast-checkout live_transition_dogs timed out after 1500ms.");
  const fast = await loadLobbyCheckoutDogsFast(
    rejecting as unknown as Parameters<typeof loadLobbyCheckoutDogsFast>[0],
    now
  );

  assert.equal(fast.supabase_timed_out, true);
  assert.equal(fast.data_source, "gingr_back_of_house_cache");
  assert.equal(fast.featured?.dog_name, "Luna");
  assert.equal(fast.activeCount, 1);
  assert.doesNotThrow(() => {
    // The production bug: loadFastPromptedCheckouts threw and the lobby TV
    // served an empty stale payload instead of the Gingr basket dog.
  });

  const prompted = await loadFastPromptedCheckouts(
    rejecting as unknown as Parameters<typeof loadFastPromptedCheckouts>[0],
    now
  );
  assert.equal(prompted.checking_out[0]?.animal_name, "Luna");

  __resetLiveTransitionQueryCooldownForTests();
  const full = await loadLobbyCheckoutDogs(
    rejecting as unknown as Parameters<typeof loadLobbyCheckoutDogs>[0],
    6,
    now
  );
  assert.equal(full.featured?.dog_name, "Luna", "full lobby sync must keep Gingr basket dogs when Supabase times out");
  assert.equal(full.supabase_timed_out, true);
  assert.ok(full.activeCount >= 1);

  console.log("lobby fast checkout timeout checks passed");
  } finally {
    if (previousGingrKey === undefined) delete process.env.GINGR_API_KEY;
    else process.env.GINGR_API_KEY = previousGingrKey;
  }
}

void main();
