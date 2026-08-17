import assert from "node:assert/strict";
import {
  isTlGingrKeyConfigured,
  requireTlGingrApiKey,
  resolveTlGingrApiKey,
  TL_GINGR_KEY_ENV
} from "../lib/tl-digi-board/gingr-auth";

assert.equal(TL_GINGR_KEY_ENV, "TL_GINGR_KEY");

const previous = process.env.TL_GINGR_KEY;
delete process.env.TL_GINGR_KEY;
assert.equal(resolveTlGingrApiKey(), "");
assert.equal(isTlGingrKeyConfigured(), false);
assert.throws(() => requireTlGingrApiKey(), /TL_GINGR_KEY/);

process.env.TL_GINGR_KEY = "  test-tl-key  ";
assert.equal(resolveTlGingrApiKey(), "test-tl-key");
assert.equal(isTlGingrKeyConfigured(), true);
assert.equal(requireTlGingrApiKey(), "test-tl-key");

if (previous === undefined) delete process.env.TL_GINGR_KEY;
else process.env.TL_GINGR_KEY = previous;

console.log("test-tl-gingr-key: ok");
