import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeTvDisplayScale,
  isFullyKioskBrowser,
  isLayoutTiledVisualViewport,
  measureTvFitViewport,
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

// Hi-Browser / Hisense page zoom: stage stays full-bleed (casttv pattern).
const hiBrowserStage = measureTvViewport({
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
assert.equal(hiBrowserStage.width, 1920);
assert.equal(hiBrowserStage.height, 1080);
assert.equal(hiBrowserStage.offsetLeft, 0);
assert.equal(hiBrowserStage.offsetTop, 0);
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

// Same zoomed Hi-Browser: FIT viewport must use the visible CSS area so scale
// shrinks (scale=1 against layout was the Fully/lobby zoomed-in failure).
const hiBrowserFit = measureTvFitViewport({
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
assert.equal(hiBrowserFit.width, 640);
assert.equal(hiBrowserFit.height, 360);
assert.equal(hiBrowserFit.offsetLeft, 0);
assert.equal(hiBrowserFit.offsetTop, 0);
assert.equal(computeTvDisplayScale(hiBrowserFit.width, hiBrowserFit.height), 640 / 1920);

// Unknown WebView with a zoomed corner (Fully-like without UA): fit visible area.
const genericCornerFit = measureTvFitViewport({
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
assert.equal(genericCornerFit.width, 720);
assert.equal(genericCornerFit.height, 405);
assert.equal(computeTvDisplayScale(genericCornerFit.width, genericCornerFit.height), 720 / 1920);

// Fully Kiosk page zoom: stage full screen, fit uses visible CSS pixels.
const fullyCornerStage = measureTvViewport({
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
assert.equal(fullyCornerStage.width, 1920);
assert.equal(fullyCornerStage.height, 1080);
assert.equal(fullyCornerStage.offsetLeft, 0);
assert.equal(fullyCornerStage.offsetTop, 0);

const fullyCornerFit = measureTvFitViewport({
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
assert.equal(fullyCornerFit.width, 720);
assert.equal(fullyCornerFit.height, 405);
assert.equal(fullyCornerFit.offsetLeft, 0);
assert.equal(fullyCornerFit.offsetTop, 0);
assert.equal(computeTvDisplayScale(fullyCornerFit.width, fullyCornerFit.height), 720 / 1920);

// Fully Kiosk under-reports a phone-sized WebView on a Full HD TV (no page zoom).
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
    width: 980,
    height: 551,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  }
});
assert.equal(fullyUnderReported.width, 1920);
assert.equal(fullyUnderReported.height, 1080);
assert.equal(fullyUnderReported.offsetLeft, 0);
assert.equal(fullyUnderReported.offsetTop, 0);
assert.equal(computeTvDisplayScale(fullyUnderReported.width, fullyUnderReported.height), 1);

const fullyUnderReportedFit = measureTvFitViewport({
  innerWidth: 980,
  innerHeight: 551,
  document: { documentElement: { clientWidth: 980, clientHeight: 551 } },
  navigator: { userAgent: "FullyKioskBrowser" },
  fully: {
    getScreenWidth: () => 1920,
    getScreenHeight: () => 1080
  },
  visualViewport: {
    width: 980,
    height: 551,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  }
});
assert.equal(fullyUnderReportedFit.width, 1920);
assert.equal(fullyUnderReportedFit.height, 1080);

// Unzoomed Hi-Browser with a full visualViewport still fills normally.
const hiBrowserUnzoomed = measureTvFitViewport({
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

// Narrow / tall / 4K sanity for the pure scale math (casttv-equivalent letterbox).
assert.equal(computeTvDisplayScale(1280, 720), 1280 / 1920);
assert.equal(computeTvDisplayScale(1080, 1920), 1080 / 1920);
assert.equal(computeTvDisplayScale(3840, 2160), 2);

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
assert.match(hook, /measureTvFitViewport/);
assert.match(hook, /shouldLockTvKioskViewport/);
assert.match(hook, /resetTvBrowserZoom/);
assert.match(hook, /TV_VIEWPORT_CONTENT_KIOSK_LOCKED/);
assert.match(hook, /fitdog-tv-kiosk/);
assert.match(hook, /tvDebug/);
assert.match(hook, /logTvLayoutDiagnostics/);

const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /text-size-adjust:\s*100%/);
assert.match(css, /--fitdog-tv-scale:\s*min\(100vw \/ 1920/);
assert.match(css, /html\.fitdog-tv-kiosk/);
assert.match(css, /zoom:\s*1/);

const lobbyLayout = readFileSync("app/lobby/layout.tsx", "utf8");
assert.match(lobbyLayout, /export const viewport/);
assert.match(lobbyLayout, /maximumScale:\s*1/);
assert.match(lobbyLayout, /userScalable:\s*false/);
assert.match(lobbyLayout, /setScale\(1\)/);

// sanity: deprecated helper still imported for compatibility
assert.equal(typeof isLayoutTiledVisualViewport, "function");

console.log("display TV layout tests passed");
