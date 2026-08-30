import assert from "node:assert/strict";
import {
  advanceCheckoutSpotlightState,
  checkoutSpotlightIsActive,
  emptyCheckoutSpotlightState,
  getActiveSpotlightDogs,
  getCheckoutSpotlightEventKey,
  isSpotlightWindowExpired,
  sortCheckoutDogsChronologically,
  SPOTLIGHT_DURATION_LONG_MS,
  SPOTLIGHT_DURATION_SHORT_MS,
  spotlightDurationMs,
  spotlightRemainingMs,
  syncCheckoutSpotlightQueue,
  type CheckoutSpotlightState
} from "../lib/lobby/checkout-spotlight-queue";
import {
  buildCheckoutDaySummary,
  buildCheckoutFunFacts
} from "../lib/lobby/checkout-spotlight-fun-facts";
import { lobbyLightAssets } from "../lib/lobby/assets";
import { toDisplayPhotoUrl } from "../lib/gingr-photo-display";
import type { LobbyCheckoutDog } from "../lib/lobby/types";

function dog(partial: Partial<LobbyCheckoutDog> & Pick<LobbyCheckoutDog, "id" | "dog_name">): LobbyCheckoutDog {
  return {
    gingr_animal_id: partial.gingr_animal_id ?? partial.id,
    breed: partial.breed ?? "Mix",
    dog_photo_url: partial.dog_photo_url ?? null,
    checkout_status: partial.checkout_status ?? "Checking out",
    prompted_at: partial.prompted_at ?? "2026-08-30T18:00:00.000Z",
    estimated_ready_at: null,
    display_until: partial.display_until ?? null,
    ...partial
  };
}

function run(label: string, fn: () => void) {
  fn();
  console.log(`ok - ${label}`);
}

run("one dog → 5 minute spotlight window", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(state, [dog({ id: "1", dog_name: "Cash", prompted_at: "2026-08-30T18:00:00.000Z" })], t0);
  state = advanceCheckoutSpotlightState(state, t0);
  assert.equal(checkoutSpotlightIsActive(state), true);
  assert.equal(getActiveSpotlightDogs(state).map((d) => d.dog_name).join(","), "Cash");
  assert.equal(state.window?.durationMs, SPOTLIGHT_DURATION_LONG_MS);
  assert.equal(spotlightRemainingMs(state, t0 + 4 * 60_000), 60_000);
  assert.equal(isSpotlightWindowExpired(state, t0 + SPOTLIGHT_DURATION_LONG_MS - 1), false);
  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_LONG_MS);
  assert.equal(checkoutSpotlightIsActive(state), false);
  assert.equal(state.queue.length, 0);
});

run("exactly two dogs → split-screen window for 5 minutes", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(
    state,
    [
      dog({ id: "1", dog_name: "Cash", prompted_at: "2026-08-30T18:00:01.000Z" }),
      dog({ id: "2", dog_name: "Maple", prompted_at: "2026-08-30T18:00:02.000Z" })
    ],
    t0
  );
  state = advanceCheckoutSpotlightState(state, t0);
  assert.equal(getActiveSpotlightDogs(state).length, 2);
  assert.deepEqual(
    getActiveSpotlightDogs(state).map((d) => d.dog_name),
    ["Cash", "Maple"]
  );
  assert.equal(state.window?.durationMs, SPOTLIGHT_DURATION_LONG_MS);
});

run("three or more dogs → max two visible and 2-minute rotation", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  const dogs = [
    dog({ id: "1", dog_name: "A", prompted_at: "2026-08-30T18:00:01.000Z" }),
    dog({ id: "2", dog_name: "B", prompted_at: "2026-08-30T18:00:02.000Z" }),
    dog({ id: "3", dog_name: "C", prompted_at: "2026-08-30T18:00:03.000Z" })
  ];
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(state, dogs, t0);
  state = advanceCheckoutSpotlightState(state, t0);
  assert.equal(spotlightDurationMs(3), SPOTLIGHT_DURATION_SHORT_MS);
  assert.equal(state.window?.durationMs, SPOTLIGHT_DURATION_SHORT_MS);
  assert.deepEqual(
    getActiveSpotlightDogs(state).map((d) => d.dog_name),
    ["A", "B"]
  );

  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_SHORT_MS);
  assert.deepEqual(
    getActiveSpotlightDogs(state).map((d) => d.dog_name),
    ["C"]
  );
  // Only one remaining → long window again.
  assert.equal(state.window?.durationMs, SPOTLIGHT_DURATION_LONG_MS);

  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_SHORT_MS + SPOTLIGHT_DURATION_LONG_MS);
  assert.equal(checkoutSpotlightIsActive(state), false);
});

run("chronological queue ordering", () => {
  const dogs = sortCheckoutDogsChronologically([
    dog({ id: "3", dog_name: "Late", prompted_at: "2026-08-30T18:00:30.000Z" }),
    dog({ id: "1", dog_name: "Early", prompted_at: "2026-08-30T18:00:10.000Z" }),
    dog({ id: "2", dog_name: "Mid", prompted_at: "2026-08-30T18:00:20.000Z" })
  ]);
  assert.deepEqual(
    dogs.map((d) => d.dog_name),
    ["Early", "Mid", "Late"]
  );
});

run("duplicate checkout deduplication across polls", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  const cash = dog({
    id: "1",
    gingr_animal_id: "99",
    dog_name: "Cash",
    prompted_at: "2026-08-30T18:00:00.000Z",
    dog_photo_url: "https://cdn.gingrapp.com/animals/cash.jpg"
  });
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(state, [cash], t0);
  state = advanceCheckoutSpotlightState(state, t0);
  const startedAt = state.window!.startedAt;
  const key = getCheckoutSpotlightEventKey(cash);

  // Same dog + same prompted_at on refresh — refresh photo, do not requeue or reset timer.
  const refreshed = {
    ...cash,
    dog_photo_url: "https://cdn.gingrapp.com/animals/cash-v2.jpg",
    dog_name: "Cash"
  };
  state = syncCheckoutSpotlightQueue(state, [refreshed], t0 + 30_000);
  state = advanceCheckoutSpotlightState(state, t0 + 30_000);
  assert.equal(state.queue.length, 1);
  assert.equal(state.window?.startedAt, startedAt);
  assert.equal(state.queue[0]!.dog.dog_photo_url, "https://cdn.gingrapp.com/animals/cash-v2.jpg");
  assert.equal(state.queue.filter((entry) => entry.key === key).length, 1);
});

run("polling refresh does not reset active timer", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(
    state,
    [dog({ id: "1", dog_name: "Cash", prompted_at: "2026-08-30T18:00:00.000Z" })],
    t0
  );
  state = advanceCheckoutSpotlightState(state, t0);
  const before = state.window!;
  for (let i = 1; i <= 5; i += 1) {
    state = syncCheckoutSpotlightQueue(
      state,
      [dog({ id: "1", dog_name: "Cash", prompted_at: "2026-08-30T18:00:00.000Z" })],
      t0 + i * 5_000
    );
    state = advanceCheckoutSpotlightState(state, t0 + i * 5_000);
  }
  assert.equal(state.window?.startedAt, before.startedAt);
  assert.equal(state.window?.durationMs, before.durationMs);
  assert.equal(spotlightRemainingMs(state, t0 + 25_000), SPOTLIGHT_DURATION_LONG_MS - 25_000);
});

run("new checkout joins queue without starving later dogs", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(
    state,
    [
      dog({ id: "1", dog_name: "A", prompted_at: "2026-08-30T18:00:01.000Z" }),
      dog({ id: "2", dog_name: "B", prompted_at: "2026-08-30T18:00:02.000Z" })
    ],
    t0
  );
  state = advanceCheckoutSpotlightState(state, t0);
  assert.deepEqual(
    getActiveSpotlightDogs(state).map((d) => d.dog_name),
    ["A", "B"]
  );

  // Third dog arrives mid-window — stays queued, current window unchanged.
  state = syncCheckoutSpotlightQueue(
    state,
    [
      dog({ id: "1", dog_name: "A", prompted_at: "2026-08-30T18:00:01.000Z" }),
      dog({ id: "2", dog_name: "B", prompted_at: "2026-08-30T18:00:02.000Z" }),
      dog({ id: "3", dog_name: "C", prompted_at: "2026-08-30T18:00:03.000Z" })
    ],
    t0 + 60_000
  );
  assert.equal(state.window?.startedAt, t0);
  assert.equal(state.queue.length, 3);

  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_LONG_MS);
  assert.deepEqual(
    getActiveSpotlightDogs(state).map((d) => d.dog_name),
    ["C"]
  );
});

run("queue exhaustion → inactive (return to normal whiteboard)", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  let state: CheckoutSpotlightState = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(
    state,
    [dog({ id: "1", dog_name: "Cash", prompted_at: "2026-08-30T18:00:00.000Z" })],
    t0
  );
  state = advanceCheckoutSpotlightState(state, t0);
  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_LONG_MS);
  assert.equal(checkoutSpotlightIsActive(state), false);
  assert.equal(getActiveSpotlightDogs(state).length, 0);
  assert.equal(state.queue.length, 0);
});

run("missing profile image stays null (UI uses FitDog logo fallback)", () => {
  const noPhoto = dog({ id: "1", dog_name: "Cash", dog_photo_url: null, gingr_animal_id: null });
  assert.equal(noPhoto.dog_photo_url, null);
  assert.equal(toDisplayPhotoUrl(null, null), null);
  assert.ok(lobbyLightAssets.dogLogoExact.includes("fitdog-dog-logo-exact.png"));
});

run("failed/missing gingr url still routes through display helper when animal id exists", () => {
  const display = toDisplayPhotoUrl(null, "4176");
  assert.equal(display, "/api/gingr/animal-photo/image?animalId=4176");
});

run("fun facts are deterministic per dog+day and avoid empty/corny stubs", () => {
  const now = new Date("2026-08-30T20:00:00.000Z");
  const a = buildCheckoutFunFacts({ dogName: "Cash", animalId: "99", count: 5, now });
  const b = buildCheckoutFunFacts({ dogName: "Cash", animalId: "99", count: 5, now });
  const c = buildCheckoutFunFacts({ dogName: "Maple", animalId: "100", count: 5, now });
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  assert.notDeepEqual(a, c);
  for (const fact of a) {
    assert.match(fact, /Cash/);
    assert.doesNotMatch(fact, /paw-some|ruff day|fur real/i);
  }
  const nextDay = buildCheckoutFunFacts({
    dogName: "Cash",
    animalId: "99",
    count: 5,
    now: new Date("2026-08-31T20:00:00.000Z")
  });
  assert.notDeepEqual(a, nextDay);

  const summary = buildCheckoutDaySummary({ dogName: "Cash", animalId: "99", now });
  assert.ok(summary.overallDay);
  assert.ok(summary.attitude);
});

run("completed event is not re-queued on later identical poll", () => {
  const t0 = Date.parse("2026-08-30T18:00:00.000Z");
  const cash = dog({ id: "1", gingr_animal_id: "99", dog_name: "Cash", prompted_at: "2026-08-30T18:00:00.000Z" });
  let state = emptyCheckoutSpotlightState();
  state = syncCheckoutSpotlightQueue(state, [cash], t0);
  state = advanceCheckoutSpotlightState(state, t0);
  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_LONG_MS);
  assert.equal(checkoutSpotlightIsActive(state), false);
  state = syncCheckoutSpotlightQueue(state, [cash], t0 + SPOTLIGHT_DURATION_LONG_MS + 1_000);
  state = advanceCheckoutSpotlightState(state, t0 + SPOTLIGHT_DURATION_LONG_MS + 1_000);
  assert.equal(checkoutSpotlightIsActive(state), false);
  assert.equal(state.queue.length, 0);
});

console.log("lobby checkout spotlight tests passed");
