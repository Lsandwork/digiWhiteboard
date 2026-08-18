import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOARD_CHECKOUT_POLL_EMPTY_MS,
  BOARD_CHECKOUT_POLL_MS,
  BOARD_REALTIME_CONFIRM_MS
} from "../lib/board-checkout-merge";
import { FAST_CHECKOUT_CACHE_TTL_MS, LIVE_BOARD_CACHE_TTL_MS } from "../lib/board-settings-cache";
import { getGingrBoardRefreshIntervalMs } from "../lib/gingr-board-refresh";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert.equal(BOARD_CHECKOUT_POLL_EMPTY_MS, 500);
assert.equal(BOARD_CHECKOUT_POLL_MS, 1000);
assert.equal(BOARD_REALTIME_CONFIRM_MS, 200);
assert.ok(FAST_CHECKOUT_CACHE_TTL_MS <= 200, "fast checkout TTL must stay well under one poll");
assert.ok(LIVE_BOARD_CACHE_TTL_MS <= 500);
assert.ok(getGingrBoardRefreshIntervalMs() <= 2000);

{
  const boardClient = source("components/BoardClient.tsx");
  assert.match(boardClient, /loadFastCheckouts\(\{ fresh: true \}\)/);
  assert.match(boardClient, /loadBoard\("connecting", \{ silent: true \}\)/);
  assert.match(boardClient, /BOARD_CHECKOUT_POLL_EMPTY_MS/);
  assert.match(boardClient, /BOARD_REALTIME_CONFIRM_MS/);
  assert.match(boardClient, /waitingForDogRef/);
  assert.match(boardClient, /fullSyncCompleted/);
  assert.doesNotMatch(boardClient, /rerunIfBusy:\s*true/);
}

{
  const checkouts = source("app/api/board/checkouts/route.ts");
  assert.match(checkouts, /private, no-store, max-age=0/);
  const liveBoard = source("app/api/live-board/route.ts");
  assert.match(liveBoard, /getCachedBackOfHouseBoard/);
  assert.match(liveBoard, /private, no-store, max-age=0/);
  const webhook = source("app/api/gingr/webhook/route.ts");
  assert.match(webhook, /Promise\.all\(\[reservationQuery, visibleQuery\]\)/);
}

{
  const emptyState = source("components/board/StaffBoardEmptyState.tsx");
  assert.match(emptyState, /STAFF_IDLE_SLIDESHOW_START_DELAY_MS/);
  assert.match(emptyState, /fetchPriority="low"/);
}

console.log("test-staff-board-appear-fast: all assertions passed");
