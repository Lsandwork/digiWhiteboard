import assert from "node:assert/strict";
import {
  isTlGingrKeyConfigured,
  requireTlGingrApiKey,
  resolveTlGingrApiKey,
  TL_GINGR_KEY_ENV
} from "../lib/tl-digi-board/gingr-auth";

assert.equal(TL_GINGR_KEY_ENV, "TL_GINGR_KEY");

const previousTl = process.env.TL_GINGR_KEY;
const previousGingr = process.env.GINGR_API_KEY;
delete process.env.TL_GINGR_KEY;
delete process.env.GINGR_API_KEY;

assert.equal(resolveTlGingrApiKey(), "");
assert.equal(isTlGingrKeyConfigured(), false);
assert.throws(() => requireTlGingrApiKey(), /TL_GINGR_KEY/);

process.env.GINGR_API_KEY = "  staff-board-key  ";
assert.equal(resolveTlGingrApiKey(), "staff-board-key");
assert.equal(requireTlGingrApiKey(), "staff-board-key");

process.env.TL_GINGR_KEY = "  test-tl-key  ";
assert.equal(resolveTlGingrApiKey(), "test-tl-key");
assert.equal(isTlGingrKeyConfigured(), true);
assert.equal(requireTlGingrApiKey(), "test-tl-key");

if (previousTl === undefined) delete process.env.TL_GINGR_KEY;
else process.env.TL_GINGR_KEY = previousTl;
if (previousGingr === undefined) delete process.env.GINGR_API_KEY;
else process.env.GINGR_API_KEY = previousGingr;

console.log("test-tl-gingr-key: ok");
