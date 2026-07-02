import assert from "node:assert/strict";
import { getDefaultCastRoute } from "../lib/lobby/cast-picker";
import { buildLobbyTvCastUrl } from "../lib/lobby/tv-cast";

assert.equal(typeof getDefaultCastRoute(), "string");
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /display=tv/);
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /token=secret/);

console.log("cast picker tests passed");
