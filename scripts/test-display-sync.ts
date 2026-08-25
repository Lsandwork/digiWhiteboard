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
import { isTvWhiteboardPath } from "../lib/tv-hard-refresh";
import { TV_HARD_REFRESH_BOOT_SCRIPT } from "../lib/tv-hard-refresh-boot-script";

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
  assert.match(displaySyncServer, /saveCastTvRefreshNonce/);
  assert.match(displaySyncServer, /loadCastTvRefreshNonce/);
  assert.match(displaySyncServer, /withTimeoutFallback/);
  assert.match(displaySyncServer, /Math\.max\(Date\.now\(\), current \+ 1\)/);
}

{
  const refreshRoute = readFileSync(join(process.cwd(), "app/api/admin/refresh/route.ts"), "utf8");
  const castRefreshRoute = readFileSync(join(process.cwd(), "app/api/admin/cast-refresh/route.ts"), "utf8");
  assert.match(refreshRoute, /signalCastDisplaysHardRefresh/);
  assert.match(refreshRoute, /CAST_REFRESH_SIGNAL_TIMEOUT_MS/);
  assert.match(refreshRoute, /refreshSupabase/);
  assert.match(castRefreshRoute, /signalCastDisplaysHardRefresh/);
  assert.match(castRefreshRoute, /maxDuration = 15/);
  assert.match(castRefreshRoute, /withTimeoutOrThrow/);
}

{
  const signal = readFileSync(join(process.cwd(), "lib/admin/signal-cast-hard-refresh.ts"), "utf8");
  assert.match(signal, /staff_whiteboard/);
  assert.match(signal, /queueHardRefreshForKnownDisplays/);
  assert.match(signal, /bumpCastHardReloadNonce/);
  assert.match(signal, /refreshPairedRemoteCastDisplays/);
  assert.match(signal, /void queueHardRefreshForKnownDisplays/);
}

{
  const client = readFileSync(join(process.cwd(), "lib/admin/cast-refresh-client.ts"), "utf8");
  assert.match(client, /AbortController/);
  assert.match(client, /credentials: "include"/);
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
  assert.match(dashboard, /CAST-TV, lobby, and staff displays were signaled to reload/);
  assert.match(dashboard, /suppressError: true/);
}

{
  const receiver = readFileSync(join(process.cwd(), "components/remote-cast/RemoteCastReceiver.tsx"), "utf8");
  assert.match(receiver, /visitPageAsNewNavigation/);
  assert.match(receiver, /runtime.refreshNonce/);
}

{
  const lobbyBoard = readFileSync(join(process.cwd(), "components/lobby/LobbyCheckoutBoard.tsx"), "utf8");
  assert.match(lobbyBoard, /useDisplaySync\(\{\s*enabled: true,/);
}

{
  const lobbyPage = readFileSync(join(process.cwd(), "components/LobbyBoardPageClient.tsx"), "utf8");
  assert.match(lobbyPage, /useDisplaySync\(\{ enabled: true \}\)/);
}

{
  const displaySync = readFileSync(join(process.cwd(), "lib/display-sync.ts"), "utf8");
  assert.match(displaySync, /visitPageAsNewNavigation/);
  assert.doesNotMatch(displaySync, /_tv_refresh/);
}

{
  const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
  assert.match(layout, /TV_HARD_REFRESH_BOOT_SCRIPT/);
}

{
  const bootSource = readFileSync(join(process.cwd(), "lib/tv-hard-refresh-boot-script.ts"), "utf8");
  assert.match(bootSource, /TV_HARD_REFRESH_ENDPOINT/);
  assert.match(bootSource, /location\.replace/);
  assert.match(bootSource, /AbortController/);
  assert.match(TV_HARD_REFRESH_BOOT_SCRIPT, /\/api\/display\/hard-refresh/);
  assert.match(TV_HARD_REFRESH_BOOT_SCRIPT, /location\.replace/);
  assert.match(TV_HARD_REFRESH_BOOT_SCRIPT, /AbortController/);
}

{
  const hardRefreshRoute = readFileSync(join(process.cwd(), "app/api/display/hard-refresh/route.ts"), "utf8");
  assert.match(hardRefreshRoute, /loadCastHardReloadNonce/);
}

{
  assert.equal(isTvWhiteboardPath("/"), true);
  assert.equal(isTvWhiteboardPath("/lobby/checkouts"), true);
  assert.equal(isTvWhiteboardPath("/cast/receiver"), true);
  assert.equal(isTvWhiteboardPath("/cast-tv"), true);
  assert.equal(isTvWhiteboardPath("/admin"), false);
  assert.equal(isTvWhiteboardPath("/blog"), false);
}

{
  const remoteTypes = readFileSync(join(process.cwd(), "lib/remote-cast/types.ts"), "utf8");
  assert.match(remoteTypes, /RECEIVER_STATE_POLL_MS = 2_000/);
}

{
  const remoteServer = readFileSync(join(process.cwd(), "lib/remote-cast/server.ts"), "utf8");
  assert.match(remoteServer, /export async function refreshPairedRemoteCastDisplays/);
  assert.match(remoteServer, /command: "REFRESH"/);
}

console.log("display sync tests passed");
