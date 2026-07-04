import assert from "node:assert/strict";
import { DEFAULT_ADMIN_SETTINGS } from "../lib/admin/settings";
import { defaultDisplaySyncState } from "../lib/display-sync-server";

const defaults = defaultDisplaySyncState();
assert.equal(typeof defaults.display_content_revision, "number");
assert.equal(typeof defaults.cast_hard_reload_nonce, "number");
assert.equal(typeof defaults.build_id, "string");
assert.equal(DEFAULT_ADMIN_SETTINGS.display_content_revision, 0);
assert.equal(DEFAULT_ADMIN_SETTINGS.cast_hard_reload_nonce, 0);

console.log("display sync tests passed");
