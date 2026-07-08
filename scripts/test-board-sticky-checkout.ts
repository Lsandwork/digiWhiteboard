import assert from "node:assert/strict";
import {
  getCheckoutMergeKey,
  mergeStickyCheckoutDogs,
  stickyCheckoutStateToDogs
} from "../lib/board-sticky-checkout";
import type { LiveDog } from "../lib/types";

const now = new Date("2026-06-30T12:01:00.000Z");

function checkoutDog(overrides: Partial<LiveDog> = {}): LiveDog {
  return {
    id: "supabase-uuid-1",
    gingr_reservation_id: "res-100",
    gingr_animal_id: "animal-200",
    animal_name: "Brody",
    owner_name: "Johnson",
    photo_url: null,
    reservation_type: "Daycare",
    current_status: "checking_out",
    display_status: "checking_out",
    room: "Front Desk",
    notes: null,
    flags: {},
    status_started_at: "2026-06-30T12:00:00.000Z",
    completed_at: null,
    display_until: "2026-06-30T12:05:00.000Z",
    last_seen_from_gingr_at: null,
    raw_payload: {
      source: "gingr webhook",
      checkout_prompted: true,
      checkout_prompted_at: "2026-06-30T12:00:00.000Z"
    },
    hidden: false,
    updated_at: "2026-06-30T12:00:00.000Z",
    ...overrides
  };
}

const webhookDog = checkoutDog();
const gingrDog = checkoutDog({
  id: "gingr-row-99",
  status_started_at: "2026-06-30T12:00:30.000Z",
  display_until: "2026-06-30T12:05:30.000Z",
  raw_payload: { source: "gingr_back_of_house" }
});

assert.equal(getCheckoutMergeKey(webhookDog), getCheckoutMergeKey(gingrDog));

let sticky = mergeStickyCheckoutDogs(new Map(), [webhookDog], now);
assert.equal(stickyCheckoutStateToDogs(sticky).length, 1);

sticky = mergeStickyCheckoutDogs(sticky, [], now);
assert.equal(stickyCheckoutStateToDogs(sticky).length, 1, "empty poll must not erase sticky checkout");

sticky = mergeStickyCheckoutDogs(sticky, [], now, { basketAuthoritative: true });
assert.equal(stickyCheckoutStateToDogs(sticky).length, 0, "authoritative empty basket clears sticky checkout");

sticky = mergeStickyCheckoutDogs(new Map(), [webhookDog], now);
sticky = mergeStickyCheckoutDogs(sticky, [], now);
assert.equal(stickyCheckoutStateToDogs(sticky).length, 1, "empty poll must not erase sticky checkout without basket authority");

const otherDog = checkoutDog({
  id: "supabase-uuid-2",
  gingr_reservation_id: "res-200",
  gingr_animal_id: "animal-300",
  animal_name: "Nova"
});
sticky = mergeStickyCheckoutDogs(new Map(), [webhookDog, otherDog], now);
sticky = mergeStickyCheckoutDogs(sticky, [otherDog], now, { basketAuthoritative: true });
assert.equal(stickyCheckoutStateToDogs(sticky).length, 1, "authoritative poll removes checkout rows missing from server response");
assert.equal(stickyCheckoutStateToDogs(sticky)[0]?.animal_name, "Nova");

sticky = mergeStickyCheckoutDogs(new Map(), [webhookDog], now);
sticky = mergeStickyCheckoutDogs(sticky, [otherDog], now);
assert.equal(stickyCheckoutStateToDogs(sticky).length, 2, "non-authoritative poll keeps existing checkout rows");

sticky = mergeStickyCheckoutDogs(new Map(), [webhookDog], now);
sticky = mergeStickyCheckoutDogs(sticky, [gingrDog], now);
const merged = stickyCheckoutStateToDogs(sticky);
assert.equal(merged.length, 1);
assert.equal(merged[0]?.status_started_at, "2026-06-30T12:00:00.000Z", "keeps earliest anchor for timer stability");

sticky = mergeStickyCheckoutDogs(sticky, [{ ...webhookDog, hidden: true }], now);
assert.equal(stickyCheckoutStateToDogs(sticky).length, 0, "hidden checkout removes sticky row");

const expiredDog = checkoutDog({
  status_started_at: "2026-06-30T11:00:00.000Z",
  display_until: "2026-06-30T11:05:00.000Z"
});
sticky = mergeStickyCheckoutDogs(new Map(), [expiredDog], new Date("2026-06-30T11:06:00.000Z"));
assert.equal(stickyCheckoutStateToDogs(sticky).length, 0, "expired checkout is pruned");

console.log("board-sticky-checkout checks passed");
