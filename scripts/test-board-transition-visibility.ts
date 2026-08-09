import assert from "node:assert/strict";
import { isVisibleLobbyCheckoutDog } from "../lib/lobby/checkout";
import { shouldHideCompletedDog } from "../lib/transition-cleanup";
import type { LiveDog } from "../lib/types";

const now = new Date("2026-06-30T12:01:00.000Z");

const activeCheckout: LiveDog = {
  id: "1",
  gingr_reservation_id: "res-1",
  gingr_animal_id: "animal-1",
  animal_name: "Brody",
  owner_name: null,
  photo_url: null,
  reservation_type: "Daycare",
  current_status: "checked_out",
  display_status: "checking_out",
  room: null,
  notes: null,
  flags: {},
  status_started_at: "2026-06-30T12:00:00.000Z",
  completed_at: "2026-06-30T12:00:30.000Z",
  display_until: "2026-06-30T12:10:00.000Z",
  last_seen_from_gingr_at: null,
  raw_payload: { source: "gingr_webhook" },
  hidden: false,
  updated_at: "2026-06-30T12:00:30.000Z"
};

assert.equal(
  shouldHideCompletedDog(activeCheckout, now),
  false,
  "completed checkout must not hide before minimum visible window"
);

assert.equal(
  isVisibleLobbyCheckoutDog(activeCheckout, now, new Set(), { requireGingrBasket: true }),
  true,
  "lobby checkout stays visible without basket membership until display window expires"
);

console.log("board transition visibility checks passed");
