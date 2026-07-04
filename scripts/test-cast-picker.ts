import assert from "node:assert/strict";
import { getDefaultCastRoute } from "../lib/lobby/cast-picker";
import { buildLobbyTvCastUrl, buildStaffTvCastUrl, getCastSiteOrigin } from "../lib/lobby/tv-cast";

assert.equal(typeof getDefaultCastRoute(), "string");
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /display=tv/);
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /token=secret/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /display=tv/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /token=secret/);
assert.equal(getCastSiteOrigin("https://fitdog-gingr-status-board.vercel.app/"), "https://fitdog-gingr-status-board.vercel.app");

console.log("cast picker tests passed");
