import assert from "node:assert/strict";
import { getDefaultCastRoute } from "../lib/lobby/cast-picker";

const originalNavigator = global.navigator;

function withUserAgent(userAgent: string, run: () => void) {
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { userAgent }
  });
  try {
    run();
  } finally {
    Object.defineProperty(global, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
}

withUserAgent(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  () => {
    const { isAndroidChrome, prefersWirelessCastOnMobile } = require("../lib/lobby/cast-platform");
    assert.equal(isAndroidChrome(), true);
    assert.equal(typeof prefersWirelessCastOnMobile(), "boolean");
  }
);

withUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
  () => {
    const { isChromeIos } = require("../lib/lobby/cast-platform");
    assert.equal(isChromeIos(), true);
  }
);

assert.equal(typeof getDefaultCastRoute(), "string");
console.log("cast platform tests passed");
