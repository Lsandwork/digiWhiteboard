import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeTvDisplayScale,
  isFullyKioskBrowser,
  isLayoutTiledVisualViewport,
  measureTvViewport,
  shouldLockTvKioskViewport,
  TV_DESIGN_HEIGHT,
  TV_DESIGN_WIDTH,
  TV_VIEWPORT_CONTENT,
  TV_VIEWPORT_CONTENT_KIOSK_LOCKED
} from "../lib/display-tv-layout";

assert.equal(TV_DESIGN_WIDTH, 1920);
assert.equal(TV_DESIGN_HEIGHT, 1080);

assert.match(TV_VIEWPORT_CONTENT, /width=device-width/);
assert.match(TV_VIEWPORT_CONTENT, /initial-scale=1/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /width=1920/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /user-scalable=no/);
assert.doesNotMatch(TV_VIEWPORT_CONTENT, /maximum-scale=1/);
assert.match(TV_VIEWPORT_CONTENT_KIOSK_LOCKED, /maximum-scale=1/);
assert.match(TV_VIEWPORT_CONTENT_KIOSK_LOCKED, /user-scalable=no/);

assert.equal(computeTvDisplayScale(1920, 1080), 1);
assert.equal(computeTvDisplayScale(960, 540), 0.5);
assert.equal(computeTvDisplayScale(3840, 2160), 2);
assert.equal(computeTvDisplayScale(1920, 540), 0.5);
assert.equal(computeTvDisplayScale(640, 360), 640 / 1920);

const fullHd = measureTvViewport({ innerWidth: 1920, innerHeight: 1080 });
assert.equal(fullHd.width, 1920);
assert.equal(fullHd.height, 1080);
assert.equal(computeTvDisplayScale(fullHd.width, fullHd.height), 1);

// Hi-Browser / Hisense page zoom: cropped visualViewport must NOT postage-stamp
// the board into a corner — fill the layout/screen (same as Fully).
const hiBrowserFullscreen = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: { userAgent: "Mozilla/5.0 Hisense HiBrowser" },
  visualViewport: {
    width: 640,
    height: 360,
    offsetLeft: 1280,
    offsetTop: 720,
    scale: 3
  }
});
assert.equal(hiBrowserFullscreen.width, 1920);
assert.equal(hiBrowserFullscreen.height, 1080);
assert.equal(hiBrowserFullscreen.offsetLeft, 0);
assert.equal(hiBrowserFullscreen.offsetTop, 0);
assert.equal(computeTvDisplayScale(hiBrowserFullscreen.width, hiBrowserFullscreen.height), 1);
assert.equal(
  shouldLockTvKioskViewport({
    innerWidth: 1920,
    innerHeight: 1080,
    navigator: { userAgent: "Mozilla/5.0 Hisense HiBrowser" },
    visualViewport: {
      width: 640,
      height: 360,
      offsetLeft: 1280,
      offsetTop: 720,
      scale: 3
    }
  }),
  true
);

// Unknown WebView with a zoomed corner (Fully-like without UA): fill the screen.
const genericCornerZoom = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: { userAgent: "Mozilla/5.0 Chrome/120 Mobile Safari" },
  visualViewport: {
    width: 720,
    height: 405,
    offsetLeft: 1100,
    offsetTop: 600,
    scale: 2.5
  }
});
assert.equal(genericCornerZoom.width, 1920);
assert.equal(genericCornerZoom.height, 1080);
assert.equal(genericCornerZoom.offsetLeft, 0);
assert.equal(genericCornerZoom.offsetTop, 0);

// Fully Kiosk page zoom: visualViewport is a cropped corner that does NOT tile
// the layout. Must fill the full screen — never postage-stamp the board.
const fullyCornerZoom = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: { userAgent: "Mozilla/5.0 FullyKioskBrowser/1.50" },
  fully: {
    getScreenWidth: () => 1920,
    getScreenHeight: () => 1080
  },
  visualViewport: {
    width: 720,
    height: 405,
    offsetLeft: 1100,
    offsetTop: 600,
    scale: 2.5
  }
});
assert.equal(fullyCornerZoom.width, 1920);
assert.equal(fullyCornerZoom.height, 1080);
assert.equal(fullyCornerZoom.offsetLeft, 0);
assert.equal(fullyCornerZoom.offsetTop, 0);
assert.equal(computeTvDisplayScale(fullyCornerZoom.width, fullyCornerZoom.height), 1);

// Fully Kiosk under-reports a phone-sized WebView on a Full HD TV.
const fullyUnderReported = measureTvViewport({
  innerWidth: 980,
  innerHeight: 551,
  document: { documentElement: { clientWidth: 980, clientHeight: 551 } },
  navigator: { userAgent: "FullyKioskBrowser" },
  fully: {
    getScreenWidth: () => 1920,
    getScreenHeight: () => 1080
  },
  visualViewport: {
    width: 400,
    height: 225,
    offsetLeft: 500,
    offsetTop: 300,
    scale: 2
  }
});
assert.equal(fullyUnderReported.width, 1920);
assert.equal(fullyUnderReported.height, 1080);
assert.equal(fullyUnderReported.offsetLeft, 0);
assert.equal(fullyUnderReported.offsetTop, 0);
assert.equal(computeTvDisplayScale(fullyUnderReported.width, fullyUnderReported.height), 1);

// Unzoomed Hi-Browser with a full visualViewport still fills normally.
const hiBrowserUnzoomed = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: { userAgent: "Mozilla/5.0 Hisense HiBrowser" },
  visualViewport: {
    width: 1920,
    height: 1080,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  }
});
assert.equal(hiBrowserUnzoomed.width, 1920);
assert.equal(hiBrowserUnzoomed.height, 1080);
assert.equal(hiBrowserUnzoomed.offsetLeft, 0);
assert.equal(hiBrowserUnzoomed.offsetTop, 0);

assert.equal(isFullyKioskBrowser({ innerWidth: 1, innerHeight: 1, fully: {} }), true);
assert.equal(
  isFullyKioskBrowser({
    innerWidth: 1,
    innerHeight: 1,
    navigator: { userAgent: "Fully Kiosk Browser" }
  }),
  true
);
assert.equal(
  isFullyKioskBrowser({
    innerWidth: 1,
    innerHeight: 1,
    navigator: { userAgent: "Chrome Hi-Browser" }
  }),
  false
);

const hook = readFileSync("hooks/useDisplayTvLayout.ts", "utf8");
assert.match(hook, /useLayoutEffect/);
assert.match(hook, /visualViewport/);
assert.match(hook, /fullscreenchange/);
assert.match(hook, /applyTvStageToVisibleViewport/);
assert.match(hook, /measureTvViewport/);
assert.match(hook, /shouldLockTvKioskViewport/);
assert.match(hook, /resetTvBrowserZoom/);
assert.match(hook, /TV_VIEWPORT_CONTENT_KIOSK_LOCKED/);
assert.match(hook, /fitdog-tv-kiosk/);

const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /text-size-adjust:\s*100%/);
assert.match(css, /--fitdog-tv-scale:\s*min\(100vw \/ 1920/);
assert.match(css, /html\.fitdog-tv-kiosk/);
assert.match(css, /zoom:\s*1/);

// sanity: deprecated helper still imported for compatibility
assert.equal(typeof isLayoutTiledVisualViewport, "function");

console.log("display TV layout tests passed");
