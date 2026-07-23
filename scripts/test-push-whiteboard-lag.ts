import assert from "node:assert/strict";
import { BOARD_OVERLAY_CACHE_TTL_MS, invalidateBoardOverlayCaches } from "../lib/board-settings-cache";
import {
  getOrLoadTtlCache,
  invalidateTtlCache,
  getTtlCache,
  setTtlCache
} from "../lib/server-ttl-cache";
import {
  MAX_STORED_STAFF_PUSH_NOTICES,
  pruneStaffPushNotices,
  type StaffPushNotice
} from "../lib/staff/push-notices";

function makeNotice(overrides: Partial<StaffPushNotice> & { id: string; created_at: string }): StaffPushNotice {
  return {
    title: "Test",
    message: null,
    priority: "normal",
    display_mode: "normal",
    is_active: false,
    is_default: false,
    created_by: null,
    updated_by: null,
    pushed_at: null,
    expires_at: null,
    cleared_at: null,
    updated_at: overrides.created_at,
    ...overrides
  };
}

async function testOverlayCacheTtlIsShort() {
  assert.ok(BOARD_OVERLAY_CACHE_TTL_MS <= 2_000, "overlay TTL should stay short for push freshness");
}

async function testInvalidateDropsInFlightStaleWrite() {
  const key = "board-overlays:lag-test";
  invalidateTtlCache(key);

  let resolveLoader: ((value: string) => void) = () => undefined;
  const slow = getOrLoadTtlCache(key, 5_000, () =>
    new Promise<string>((resolve) => {
      resolveLoader = resolve;
    })
  );

  // Push lands and invalidates while the slow overlay load is still in flight.
  invalidateBoardOverlayCaches();
  assert.equal(getTtlCache(key), null);

  resolveLoader("stale-before-push");
  await slow;

  assert.equal(getTtlCache(key), null, "in-flight stale overlay must not repopulate after invalidate");

  const fresh = await getOrLoadTtlCache(key, 5_000, async () => "fresh-after-push");
  assert.equal(fresh, "fresh-after-push");
  assert.equal(getTtlCache(key), "fresh-after-push");
}

function testPruneKeepsActiveAndCapsHistory() {
  const notices = Array.from({ length: 150 }, (_, index) =>
    makeNotice({
      id: `n-${index}`,
      created_at: new Date(Date.now() - index * 1000).toISOString(),
      is_active: index === 3,
      schedule_enabled: index === 7,
      recurrence: index === 7 ? "day" : "none"
    })
  );

  const pruned = pruneStaffPushNotices(notices, MAX_STORED_STAFF_PUSH_NOTICES);
  assert.equal(pruned.length, MAX_STORED_STAFF_PUSH_NOTICES);
  assert.ok(pruned.some((notice) => notice.id === "n-3" && notice.is_active));
  assert.ok(pruned.some((notice) => notice.id === "n-7" && notice.schedule_enabled));
}

function testExactKeyInvalidate() {
  setTtlCache("whiteboard-state:staff:video-1", { ok: true }, 10_000);
  invalidateTtlCache("whiteboard-state:");
  assert.equal(getTtlCache("whiteboard-state:staff:video-1"), null);
}

async function main() {
  await testOverlayCacheTtlIsShort();
  await testInvalidateDropsInFlightStaleWrite();
  testPruneKeepsActiveAndCapsHistory();
  testExactKeyInvalidate();
  console.log("push whiteboard lag tests passed");
}

void main();
