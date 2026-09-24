import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeTvDisplayScale,
  computeTvDisplayOffsets,
  isFullyKioskBrowser,
  isGoogleTvStreamerBrowser,
  isLayoutTiledVisualViewport,
  isTvDisplayBrowser,
  measureTvFitViewport,
  measureTvViewport,
  measureVisibleCssBox,
  parseCssZoom,
  readEffectivePageZoom,
  shouldFillTvStageFullBleed,
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

// Perfect 16:9 fit → no letterbox offsets.
assert.deepEqual(computeTvDisplayOffsets(1920, 1080, 1), { offsetX: 0, offsetY: 0 });
assert.deepEqual(computeTvDisplayOffsets(960, 540, 0.5), { offsetX: 0, offsetY: 0 });
// Tall stage letterboxes horizontally.
{
  const scale = computeTvDisplayScale(1080, 1920);
  const paintedW = 1920 * scale;
  assert.deepEqual(computeTvDisplayOffsets(1080, 1920, scale), {
    offsetX: (1080 - paintedW) / 2,
    offsetY: (1920 - 1080 * scale) / 2
  });
}

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
// Fit/stage MUST use the CSS viewport (980×551), NOT Fully screen 1920×1080 —
// mixing those units produced scale=1 and the zoomed/cropped TV failure.
// Cast-TV works on the same device because it paints fluid inset:0 into 980×551.
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
assert.equal(fullyUnderReported.width, 980);
assert.equal(fullyUnderReported.height, 551);
assert.equal(fullyUnderReported.offsetLeft, 0);
assert.equal(fullyUnderReported.offsetTop, 0);
assert.equal(
  computeTvDisplayScale(fullyUnderReported.width, fullyUnderReported.height),
  Math.min(980 / 1920, 551 / 1080)
);

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
assert.equal(fullyUnderReportedFit.width, 980);
assert.equal(fullyUnderReportedFit.height, 551);
assert.equal(
  computeTvDisplayScale(fullyUnderReportedFit.width, fullyUnderReportedFit.height),
  Math.min(980 / 1920, 551 / 1080)
);

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

const streamerUa = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; TV Streamer Build/UTT1.240305.001.A5; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36"
};

assert.equal(isGoogleTvStreamerBrowser({ innerWidth: 1, innerHeight: 1, navigator: streamerUa }), true);
assert.equal(isTvDisplayBrowser({ innerWidth: 1, innerHeight: 1, navigator: streamerUa }), true);
assert.equal(
  isGoogleTvStreamerBrowser({
    innerWidth: 1,
    innerHeight: 1,
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/125.0.0.0 Mobile Safari/537.36" }
  }),
  false
);

assert.equal(
  shouldLockTvKioskViewport({
    innerWidth: 1920,
    innerHeight: 1080,
    navigator: streamerUa,
    visualViewport: { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0, scale: 1.5 }
  }),
  false,
  "Google Streamer Internet app must keep remote zoom working"
);
assert.equal(
  shouldFillTvStageFullBleed({
    innerWidth: 1920,
    innerHeight: 1080,
    navigator: streamerUa,
    visualViewport: { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0, scale: 1.5 }
  }),
  true
);

const streamerZoomedFit = measureTvFitViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: streamerUa,
  visualViewport: {
    width: 1280,
    height: 720,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1.5
  }
});
assert.equal(streamerZoomedFit.width, 1280);
assert.equal(streamerZoomedFit.height, 720);
assert.equal(streamerZoomedFit.offsetLeft, 0);
assert.equal(computeTvDisplayScale(streamerZoomedFit.width, streamerZoomedFit.height), 1280 / 1920);

const streamerZoomedStage = measureTvViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: streamerUa,
  visualViewport: {
    width: 1280,
    height: 720,
    offsetLeft: 40,
    offsetTop: 20,
    scale: 1.5
  }
});
assert.equal(streamerZoomedStage.width, 1280);
assert.equal(streamerZoomedStage.height, 720);
assert.equal(streamerZoomedStage.offsetLeft, 40);
assert.equal(streamerZoomedStage.offsetTop, 20);

// Streamer reports scale but leaves visualViewport at layout size.
const streamerScaleOnly = measureTvFitViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: streamerUa,
  visualViewport: {
    width: 1920,
    height: 1080,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 2
  }
});
assert.equal(streamerScaleOnly.width, 960);
assert.equal(streamerScaleOnly.height, 540);
assert.equal(computeTvDisplayScale(streamerScaleOnly.width, streamerScaleOnly.height), 0.5);

assert.equal(parseCssZoom("150%"), 1.5);
assert.equal(parseCssZoom("1.5"), 1.5);
assert.equal(readEffectivePageZoom({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080, style: { zoom: "150%" } } }
}), 1.5);

const cssZoomedFit = measureVisibleCssBox({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080, style: { zoom: "150%" } } },
  navigator: streamerUa,
  visualViewport: {
    width: 1920,
    height: 1080,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  }
});
assert.equal(cssZoomedFit.width, 1280);
assert.equal(cssZoomedFit.height, 720);
assert.equal(computeTvDisplayScale(cssZoomedFit.width, cssZoomedFit.height), 1280 / 1920);

const zoomedOutFit = measureTvFitViewport({
  innerWidth: 1920,
  innerHeight: 1080,
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  navigator: streamerUa,
  visualViewport: {
    width: 2560,
    height: 1440,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 0.75
  }
});
assert.equal(zoomedOutFit.width, 2560);
assert.equal(zoomedOutFit.height, 1440);
assert.equal(computeTvDisplayScale(zoomedOutFit.width, zoomedOutFit.height), 2560 / 1920);

const genericAndroidTvWebView = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Build/UTT1.240305.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36"
};
assert.equal(
  isGoogleTvStreamerBrowser({
    innerWidth: 1920,
    innerHeight: 1080,
    screen: { width: 1920, height: 1080 },
    navigator: genericAndroidTvWebView
  }),
  true
);
assert.equal(
  isGoogleTvStreamerBrowser({
    innerWidth: 412,
    innerHeight: 915,
    screen: { width: 412, height: 915 },
    navigator: {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36"
    }
  }),
  false
);

const streamerNarrowLayout = measureTvFitViewport({
  innerWidth: 960,
  innerHeight: 540,
  document: { documentElement: { clientWidth: 960, clientHeight: 540 } },
  navigator: streamerUa,
  screen: { width: 1920, height: 1080 },
  visualViewport: {
    width: 960,
    height: 540,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  }
});
assert.equal(streamerNarrowLayout.width, 960);
assert.equal(streamerNarrowLayout.height, 540);
assert.equal(computeTvDisplayScale(streamerNarrowLayout.width, streamerNarrowLayout.height), 0.5);

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
assert.match(hook, /fitdog-tv-google-tv/);
assert.match(hook, /computeTvDisplayScale\(scaleW, scaleH\)/);
assert.match(hook, /computeTvDisplayOffsets/);
assert.match(hook, /Math\.min\(stageW, fitBox\.width\)/);
assert.match(hook, /Math\.min\(stageH, fitBox\.height\)/);

const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /text-size-adjust:\s*100%/);
assert.match(css, /--fitdog-tv-scale:\s*min\(100dvw \/ 1920/);
assert.match(css, /--fitdog-tv-offset-x/);
assert.match(css, /--fitdog-tv-offset-y/);
assert.match(css, /html\.fitdog-tv-kiosk/);
assert.match(css, /zoom:\s*1/);
assert.match(css, /html\.fitdog-tv-google-tv/);
assert.match(css, /transform-origin:\s*top left/);
assert.match(css, /translate\(var\(--fitdog-tv-offset-x/);

const lobbyLayout = readFileSync("app/lobby/layout.tsx", "utf8");
assert.match(lobbyLayout, /export const viewport/);
assert.match(lobbyLayout, /maximumScale:\s*1/);
assert.match(lobbyLayout, /userScalable:\s*false/);
assert.match(lobbyLayout, /setScale\(1\)/);

// sanity: deprecated helper still imported for compatibility
assert.equal(typeof isLayoutTiledVisualViewport, "function");

console.log("display TV layout tests passed");
