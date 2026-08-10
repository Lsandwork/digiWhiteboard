import assert from "node:assert/strict";
import {
  buildCastLiteQuery,
  buildLobbyCastUrl,
  buildStaffCastUrl,
  defaultCastLiteOptions,
  parseCastLiteOptions
} from "../lib/whiteboard/cast-options";
import { WHITEBOARD_STATE_POLL_MS } from "../lib/whiteboard/state";

const staffDefaults = defaultCastLiteOptions("staff");
assert.equal(staffDefaults.castMode, true);
assert.equal(staffDefaults.lite, true);
assert.equal(staffDefaults.lowMotion, true);
assert.equal(staffDefaults.noVideo, false);

const emptyParams = new URLSearchParams();
assert.deepEqual(parseCastLiteOptions(emptyParams), {});

const fullParams = new URLSearchParams("castMode=1&lite=1&lowMotion=1&noVideo=1&debugBoard=1");
assert.deepEqual(parseCastLiteOptions(fullParams), {
  castMode: true,
  lite: true,
  lowMotion: true,
  noVideo: true,
  debugBoard: true
});

const staffUrl = buildStaffCastUrl("https://example.com");
assert.equal(staffUrl, "https://example.com/");

const lobbyUrl = buildLobbyCastUrl("https://example.com");
assert.equal(lobbyUrl, "https://example.com/lobby/checkouts");

const query = buildCastLiteQuery({ noVideo: true, debugBoard: true });
assert.match(query, /noVideo=1/);
assert.match(query, /debugBoard=1/);

assert.equal(WHITEBOARD_STATE_POLL_MS, 2000);
// Cast TVs must repaint within a couple of seconds even if Realtime drops an event.
assert.ok(WHITEBOARD_STATE_POLL_MS <= 2000);

console.log("whiteboard state tests passed");
