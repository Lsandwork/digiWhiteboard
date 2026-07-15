import assert from "node:assert/strict";
import { includePromptedCheckoutInBoard } from "../lib/board-checkout-merge";
import { applyOptimisticLiveBoardTransition } from "../lib/board-optimistic-transition";
import type { LiveBoardResponse, LiveDog } from "../lib/types";

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

const webhookCheckout = dog({
  id: "dog-out",
  current_status: "checking_out",
  display_status: "checking_out",
  raw_payload: { source: "gingr_webhook", webhook_type: "checking_out" }
});

assert.equal(includePromptedCheckoutInBoard(webhookCheckout, new Set()), true);
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

console.log("board optimistic transition tests passed");
