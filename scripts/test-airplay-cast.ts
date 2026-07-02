import assert from "node:assert/strict";
import {
  isAirPlayCastAvailable,
  isAirPlayPickerSupported,
  isAppleDevice,
  isChromeOnMac,
  isDisplayMediaSupported
} from "../lib/lobby/airplay-cast";

assert.equal(typeof isAirPlayPickerSupported(), "boolean");
assert.equal(typeof isAppleDevice(), "boolean");
assert.equal(typeof isChromeOnMac(), "boolean");
assert.equal(typeof isDisplayMediaSupported(), "boolean");
assert.equal(typeof isAirPlayCastAvailable(), "boolean");

console.log("airplay cast availability tests passed");
