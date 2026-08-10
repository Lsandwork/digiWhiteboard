import assert from "node:assert/strict";
import {
  BOARD_CHECKOUT_POLL_MS,
  includePromptedCheckoutInBoard,
  mergeBoardResponse,
  mergeCheckinListsForDisplay,
  mergeCheckoutListsForDisplay
} from "../lib/board-checkout-merge";
import { applyOptimisticLiveBoardTransition } from "../lib/board-optimistic-transition";
import type { LiveBoardResponse, LiveDog } from "../lib/types";

assert.equal(BOARD_CHECKOUT_POLL_MS, 1000);

function dog(overrides: Partial<LiveDog>): LiveDog {
  return {
    id: "dog-1",
    gingr_reservation_id: "res-1",
    gingr_animal_id: "animal-1",
    animal_name: "Atlas",
    owner_name: "Victoria",
    photo_url: null,
    reservation_type: "Daycare",
    current_status: "checking_in",
    display_status: "checking_in",
    room: "Front Desk",
    notes: null,
    flags: {},
    status_started_at: "2026-07-01T12:00:00.000Z",
    completed_at: null,
    display_until: "2026-07-01T12:04:00.000Z",
    last_seen_from_gingr_at: "2026-07-01T12:00:00.000Z",
    raw_payload: { source: "gingr_webhook", webhook_type: "checking_in" },
    hidden: false,
    updated_at: "2026-07-01T12:00:00.000Z",
    ...overrides
  };
}

const emptyBoard: LiveBoardResponse = {
  checking_in: [],
  checking_out: [],
  counts: { checking_in: 0, checking_out: 0, total: 0 },
  last_updated: "2026-07-01T12:00:00.000Z"
};

const recentMs = Date.now();

const webhookCheckout = dog({
  current_status: "checking_out",
  display_status: "checking_out",
  status_started_at: new Date(recentMs).toISOString(),
  updated_at: new Date(recentMs).toISOString(),
  raw_payload: { source: "gingr_webhook", webhook_type: "checking_out" }
});

assert.equal(includePromptedCheckoutInBoard(webhookCheckout, new Set(), recentMs), true);

const staleCheckout = dog({
  current_status: "checking_out",
  display_status: "checking_out",
  status_started_at: "2020-01-01T12:00:00.000Z",
  updated_at: "2020-01-01T12:00:00.000Z",
  raw_payload: { source: "gingr_webhook", webhook_type: "checking_out" }
});
assert.equal(includePromptedCheckoutInBoard(staleCheckout, new Set(), recentMs), false);
assert.equal(includePromptedCheckoutInBoard(staleCheckout, new Set(["res:res-1"]), recentMs), true);
assert.equal(
  includePromptedCheckoutInBoard(
    dog({
      display_status: "checking_out",
      raw_payload: { source: "gingr_back_of_house", record: { id: "res-9" } },
      gingr_reservation_id: "res-9"
    }),
    new Set(["res:res-9"])
  ),
  true
);

const optimisticCheckin = applyOptimisticLiveBoardTransition(emptyBoard, dog({}));
assert.ok(optimisticCheckin);
assert.equal(optimisticCheckin?.checking_in.length, 1);
assert.equal(optimisticCheckin?.checking_in[0]?.animal_name, "Atlas");

const optimisticCheckout = applyOptimisticLiveBoardTransition(emptyBoard, webhookCheckout);
assert.ok(optimisticCheckout);
assert.equal(optimisticCheckout?.checking_out.length, 1);

const optimisticRemove = applyOptimisticLiveBoardTransition(
  {
    ...emptyBoard,
    checking_in: [dog({})],
    counts: { checking_in: 1, checking_out: 0, total: 1 }
  },
  dog({ hidden: true, display_status: "removed" })
);
assert.ok(optimisticRemove);
assert.equal(optimisticRemove?.checking_in.length, 0);

const recentCheckin = dog({
  status_started_at: new Date(recentMs).toISOString(),
  updated_at: new Date(recentMs).toISOString(),
  display_until: new Date(recentMs + 4 * 60_000).toISOString()
});
const preserved = mergeCheckinListsForDisplay([], [recentCheckin], recentMs);
assert.equal(preserved.length, 1);
assert.equal(preserved[0]?.animal_name, "Atlas");

// Recognized dogs stay for the full display window even after the short cache grace.
const staleCheckin = dog({
  status_started_at: new Date(recentMs - 11_000).toISOString(),
  updated_at: new Date(recentMs - 11_000).toISOString(),
  display_until: new Date(recentMs + 3 * 60_000).toISOString()
});
assert.equal(
  mergeCheckinListsForDisplay([], [staleCheckin], recentMs).length,
  1,
  "recognized check-in must not flicker off after grace while display_until is open"
);

const completedCheckin = dog({
  status_started_at: new Date(recentMs).toISOString(),
  updated_at: new Date(recentMs).toISOString(),
  completed_at: new Date(recentMs).toISOString(),
  display_until: new Date(recentMs + 4 * 60_000).toISOString()
});
assert.equal(
  mergeCheckinListsForDisplay([], [completedCheckin], recentMs).length,
  1,
  "completed check-in still stays on the board until display_until"
);

const expiredCheckin = dog({
  status_started_at: new Date(recentMs - 10 * 60_000).toISOString(),
  updated_at: new Date(recentMs - 10 * 60_000).toISOString(),
  display_until: new Date(recentMs - 60_000).toISOString()
});
assert.equal(mergeCheckinListsForDisplay([], [expiredCheckin], recentMs).length, 0);

const suppressed = mergeCheckinListsForDisplay([], [staleCheckin], recentMs, {
  suppressedKeys: new Set(["res:res-1", "animal:animal-1"])
});
assert.equal(suppressed.length, 0, "explicit hide keys must drop sticky rows");

// Optimistic hide must remove Gingr twin rows that share animal/reservation identity.
const gingrTwin = dog({
  id: "gingr-twin",
  raw_payload: { source: "gingr_back_of_house" }
});
const twinRemoved = applyOptimisticLiveBoardTransition(
  {
    ...emptyBoard,
    checking_in: [dog({}), gingrTwin],
    counts: { checking_in: 2, checking_out: 0, total: 2 }
  },
  dog({ id: "dog-1", hidden: true, display_status: "removed" })
);
assert.ok(twinRemoved);
assert.equal(twinRemoved?.checking_in.length, 0, "identity match removes UUID + Gingr twin");

const mergedBoard = mergeBoardResponse(
  {
    ...emptyBoard,
    checking_in: [recentCheckin],
    counts: { checking_in: 1, checking_out: 0, total: 1 }
  },
  { ...emptyBoard, last_updated: new Date(recentMs).toISOString() }
);
assert.equal(mergedBoard.checking_in.length, 1);

// Basket-filtered empty poll must not wipe a just-prompted webhook checkout (flicker).
const heldCheckout = mergeCheckoutListsForDisplay([], [webhookCheckout], {
  basketConfirmedEmpty: false,
  nowMs: recentMs
});
assert.equal(heldCheckout.length, 1);
assert.equal(heldCheckout[0]?.animal_name, "Atlas");

const heldThroughConfirmedEmpty = mergeCheckoutListsForDisplay([], [webhookCheckout], {
  basketConfirmedEmpty: true,
  nowMs: recentMs
});
assert.equal(
  heldThroughConfirmedEmpty.length,
  1,
  "confirmed-empty basket must keep a recognized checkout on the board"
);

const boardKeepsCheckoutOnEmptyBasket = mergeBoardResponse(
  {
    ...emptyBoard,
    checking_out: [webhookCheckout],
    counts: { checking_in: 0, checking_out: 1, total: 1 }
  },
  {
    ...emptyBoard,
    basket_filtered: true,
    checking_out: [],
    counts: { checking_in: 0, checking_out: 0, total: 0 },
    last_updated: new Date(recentMs).toISOString()
  }
);
assert.equal(
  boardKeepsCheckoutOnEmptyBasket.checking_out.length,
  1,
  "mergeBoardResponse must not treat a single empty basket poll as confirmed-empty wipe"
);

const staleEmptyBoard = mergeBoardResponse(
  {
    ...emptyBoard,
    checking_in: [recentCheckin],
    checking_out: [webhookCheckout],
    counts: { checking_in: 1, checking_out: 1, total: 2 }
  },
  {
    ...emptyBoard,
    stale: true,
    last_updated: new Date(recentMs).toISOString()
  }
);
assert.equal(staleEmptyBoard.checking_in.length, 1);
assert.equal(staleEmptyBoard.checking_out.length, 1);

console.log("board optimistic transition tests passed");
