import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeTvDisplayScale,
  measureTvViewport,
  TV_DESIGN_HEIGHT,
  TV_DESIGN_WIDTH,
  TV_VIEWPORT_CONTENT
} from "../lib/display-tv-layout";

assert.equal(TV_DESIGN_WIDTH, 1920);
assert.equal(TV_DESIGN_HEIGHT, 1080);

assert.match(TV_VIEWPORT_CONTENT, /width=device-width/);
assert.match(TV_VIEWPORT_CONTENT, /initial-scale=1/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /width=1920/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /user-scalable=no/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /maximum-scale=1/);

assert.equal(computeTvDisplayScale(1920, 1080), 1);
assert.equal(computeTvDisplayScale(960, 540), 0.5);
assert.equal(computeTvDisplayScale(3840, 2160), 2);
assert.equal(computeTvDisplayScale(1920, 540), 0.5);
assert.equal(computeTvDisplayScale(640, 360), 640 / 1920);

const fullHd = measureTvViewport({ innerWidth: 1920, innerHeight: 1080 });
assert.equal(fullHd.width, 1920);
assert.equal(fullHd.height, 1080);
assert.equal(computeTvDisplayScale(fullHd.width, fullHd.height), 1);

const hiBrowserFullscreen = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  visualViewport: {
    width: 640,
    height: 360,
    offsetLeft: 1280,
    offsetTop: 0,
    scale: 3
  }
});
assert.equal(hiBrowserFullscreen.width, 640);
assert.equal(hiBrowserFullscreen.height, 360);
assert.equal(hiBrowserFullscreen.offsetLeft, 1280);
assert.ok(
  computeTvDisplayScale(hiBrowserFullscreen.width, hiBrowserFullscreen.height) < 0.35,
  "zoomed Hi-Browser visual viewport must shrink the 1920 canvas into the visible corner"
);

const hook = readFileSync("hooks/useDisplayTvLayout.ts", "utf8");
assert.match(hook, /useLayoutEffect/);
assert.match(hook, /visualViewport/);
assert.match(hook, /fullscreenchange/);
assert.match(hook, /applyTvStageToVisibleViewport/);
assert.match(hook, /measureTvViewport/);

const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /text-size-adjust:\s*100%/);
assert.match(css, /--fitdog-tv-scale:\s*min\(100vw \/ 1920/);

console.log("display TV layout tests passed");
