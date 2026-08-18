import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ADMIN_SETTINGS } from "../lib/admin/settings";
import { shouldHonorHardRefreshCommand } from "../lib/display-keeper";
import { defaultDisplaySyncState } from "../lib/display-sync-server";
import {
  DISPLAY_SYNC_POLL_MS,
  shouldReloadForBuild,
  shouldReloadForCastNonce
} from "../lib/display-sync";

const defaults = defaultDisplaySyncState();
assert.equal(typeof defaults.display_content_revision, "number");
assert.equal(typeof defaults.cast_hard_reload_nonce, "number");
assert.equal(typeof defaults.build_id, "string");
assert.equal(DEFAULT_ADMIN_SETTINGS.display_content_revision, 0);
assert.equal(DEFAULT_ADMIN_SETTINGS.cast_hard_reload_nonce, 0);
assert.equal(shouldReloadForCastNonce(Number.NaN), false);
assert.equal(shouldReloadForBuild(""), false);
assert.equal(shouldHonorHardRefreshCommand(), true);
assert.ok(DISPLAY_SYNC_POLL_MS <= 2_000, "staff TVs must poll remote refresh at least every 2s");

{
  const keeper = readFileSync(join(process.cwd(), "lib/display-keeper-client.ts"), "utf8");
  assert.match(keeper, /shouldReloadForBuild/);
  assert.match(keeper, /shouldReloadForCastNonce/);
  const hook = readFileSync(join(process.cwd(), "hooks/useDisplaySync.ts"), "utf8");
  assert.match(hook, /applyDisplaySyncUpdate/);
  assert.match(hook, /visibilitychange/);
  assert.doesNotMatch(hook, /softReloadDisplay\(\);/);
}

{
  const pageClient = readFileSync(join(process.cwd(), "components/StaffBoardPageClient.tsx"), "utf8");
  assert.match(pageClient, /useDisplaySync\(\{ enabled: true \}\)/);
  assert.match(pageClient, /CastKeeperProvider/);
}

{
  const boardClient = readFileSync(join(process.cwd(), "components/BoardClient.tsx"), "utf8");
  assert.match(boardClient, /useDisplaySync\(\{\s*enabled: true,/);
}

{
  const displaySyncServer = readFileSync(join(process.cwd(), "lib/display-sync-server.ts"), "utf8");
  assert.match(displaySyncServer, /loadCastHardReloadNonce/);
  assert.match(displaySyncServer, /cast_hard_reload_nonce: nonce/);
}

{
  const refreshRoute = readFileSync(join(process.cwd(), "app/api/admin/refresh/route.ts"), "utf8");
  const castRefreshRoute = readFileSync(join(process.cwd(), "app/api/admin/cast-refresh/route.ts"), "utf8");
  assert.match(refreshRoute, /signalCastDisplaysHardRefresh/);
  assert.match(castRefreshRoute, /signalCastDisplaysHardRefresh/);
}

{
  const signal = readFileSync(join(process.cwd(), "lib/admin/signal-cast-hard-refresh.ts"), "utf8");
  assert.match(signal, /staff_whiteboard/);
  assert.match(signal, /queueHardRefreshForKnownDisplays/);
  assert.match(signal, /bumpCastHardReloadNonce/);
}

{
  const keeperHook = readFileSync(join(process.cwd(), "hooks/useCastKeeper.tsx"), "utf8");
  assert.match(keeperHook, /shouldHonorHardRefreshCommand/);
  assert.match(keeperHook, /forceReloadDisplay/);
  assert.doesNotMatch(
    keeperHook,
    /hardRefresh[\s\S]{0,200}CAST_KEEPER_RELOAD_COOLDOWN_MS/
  );
}

{
  const dashboard = readFileSync(join(process.cwd(), "components/admin/AdminDashboard.tsx"), "utf8");
  assert.match(dashboard, /Staff whiteboard TVs were signaled to reload/);
}

console.log("display sync tests passed");
