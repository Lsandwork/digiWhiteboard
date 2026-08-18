import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ADMIN_SETTINGS } from "../lib/admin/settings";
import { defaultDisplaySyncState } from "../lib/display-sync-server";
import { shouldReloadForBuild, shouldReloadForCastNonce } from "../lib/display-sync";

const defaults = defaultDisplaySyncState();
assert.equal(typeof defaults.display_content_revision, "number");
assert.equal(typeof defaults.cast_hard_reload_nonce, "number");
assert.equal(typeof defaults.build_id, "string");
assert.equal(DEFAULT_ADMIN_SETTINGS.display_content_revision, 0);
assert.equal(DEFAULT_ADMIN_SETTINGS.cast_hard_reload_nonce, 0);
assert.equal(shouldReloadForCastNonce(Number.NaN), false);
assert.equal(shouldReloadForBuild(""), false);

{
  const keeper = readFileSync(join(process.cwd(), "lib/display-keeper-client.ts"), "utf8");
  assert.match(keeper, /shouldReloadForBuild/);
  assert.match(keeper, /shouldReloadForCastNonce/);
  const hook = readFileSync(join(process.cwd(), "hooks/useDisplaySync.ts"), "utf8");
  assert.match(hook, /applyDisplaySyncUpdate/);
  assert.doesNotMatch(hook, /softReloadDisplay\(\);/);
}

console.log("display sync tests passed");
