import assert from "node:assert/strict";
import { getDefaultCastRoute } from "../lib/lobby/cast-picker";
import {
  isAndroidChrome,
  isCastSenderSupported,
  isChromeIos,
  prefersWirelessCastOnMobile,
  shouldShowCastMenu
} from "../lib/lobby/cast-platform";
import { buildLobbyTvCastUrl, buildStaffTvCastUrl, getCastSiteOrigin } from "../lib/lobby/tv-cast";

assert.equal(typeof getDefaultCastRoute(), "string");
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /display=tv/);
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /chromecast=1/);
assert.match(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /token=secret/);
assert.doesNotMatch(buildLobbyTvCastUrl("http://localhost:3000/lobby/checkouts", "secret"), /lobby-cast/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /display=tv/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /chromecast=1/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /token=secret/);
assert.match(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /^https:\/\/staff\.ruffops\.com\//);
assert.doesNotMatch(buildStaffTvCastUrl("https://fitdog-gingr-status-board.vercel.app/", "secret"), /staff-cast/);
assert.equal(getCastSiteOrigin("https://fitdog-gingr-status-board.vercel.app/"), "https://staff.ruffops.com");
assert.equal(typeof isAndroidChrome(), "boolean");
assert.equal(typeof isChromeIos(), "boolean");
assert.equal(typeof isCastSenderSupported(), "boolean");
assert.equal(typeof prefersWirelessCastOnMobile(), "boolean");
assert.equal(typeof shouldShowCastMenu(), "boolean");

console.log("cast picker tests passed");
