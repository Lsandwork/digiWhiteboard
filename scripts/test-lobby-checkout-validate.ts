import assert from "node:assert/strict";
import {
  lobbyCheckoutRefreshBanner,
  lobbyCheckoutSyncFailed,
  userFacingCheckoutMessage
} from "../lib/lobby/validate";

assert.equal(userFacingCheckoutMessage("fast-checkout live_transition_dogs timed out after 1500ms.", false), null);
assert.equal(
  userFacingCheckoutMessage("fast-checkout live_transition_dogs timed out after 1500ms.", true),
  "Live board temporarily refreshing"
);
assert.equal(userFacingCheckoutMessage("Unauthorized.", false), "Lobby display is unauthorized. Open the board with a valid TV token.");

assert.equal(lobbyCheckoutSyncFailed({ error: "timeout", stale: true }), false);
assert.equal(lobbyCheckoutSyncFailed({ error: "timeout", stale: false }), true);
assert.equal(lobbyCheckoutSyncFailed({ stale: true }), false);

assert.equal(lobbyCheckoutRefreshBanner("Unable to load lobby checkouts.", false), null);
assert.equal(
  lobbyCheckoutRefreshBanner("Unable to load lobby checkouts.", true),
  "Live board temporarily refreshing"
);
assert.equal(lobbyCheckoutRefreshBanner("Unauthorized.", false), "Lobby display is unauthorized. Open the board with a valid TV token.");

console.log("lobby checkout validate tests passed");
