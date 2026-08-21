import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStaffBoardLayoutState } from "../lib/staff/board-layout";
import {
  STAFF_IDLE_SLIDESHOW_CLIENT_FETCH_TIMEOUT_MS,
  STAFF_IDLE_SLIDESHOW_DB_TIMEOUT_MS,
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  STAFF_IDLE_SLIDESHOW_LIMIT,
  STAFF_IDLE_SLIDESHOW_MEDIA_TIMEOUT_MS,
  STAFF_IDLE_SLIDESHOW_RETRY_POLL_MS,
  STAFF_IDLE_SLIDESHOW_WARM_COOLDOWN_MS,
  shuffleStaffIdleSlides,
  staffIdleSlideshowMediaUrl,
  staffIdleSlideshowStoragePath,
  visibleStaffIdleSlideIndexes
} from "../lib/staff/idle-slideshow";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert.equal(STAFF_IDLE_SLIDESHOW_INTERVAL_MS, 20000);
assert.equal(STAFF_IDLE_SLIDESHOW_LIMIT, 24);
assert.ok(STAFF_IDLE_SLIDESHOW_RETRY_POLL_MS >= 60_000);
assert.ok(STAFF_IDLE_SLIDESHOW_DB_TIMEOUT_MS <= 5_000);
assert.ok(STAFF_IDLE_SLIDESHOW_CLIENT_FETCH_TIMEOUT_MS <= 8_000);
assert.ok(STAFF_IDLE_SLIDESHOW_MEDIA_TIMEOUT_MS <= 8_000);
assert.ok(STAFF_IDLE_SLIDESHOW_WARM_COOLDOWN_MS >= 60_000);

{
  const shuffled = shuffleStaffIdleSlides(["a", "b", "c", "d"], () => 0);
  assert.deepEqual(shuffled, ["b", "c", "d", "a"]);
  const original = ["a", "b", "c"];
  shuffleStaffIdleSlides(original, () => 0.9);
  assert.deepEqual(original, ["a", "b", "c"], "shuffle must not mutate the input array");
}

{
  assert.deepEqual(visibleStaffIdleSlideIndexes(0, 0), []);
  assert.deepEqual(visibleStaffIdleSlideIndexes(0, 1), [0]);
  assert.deepEqual(visibleStaffIdleSlideIndexes(0, 2), [0, 1]);
  assert.deepEqual(visibleStaffIdleSlideIndexes(1, 5), [1, 0, 2]);
  assert.deepEqual(visibleStaffIdleSlideIndexes(0, 5), [0, 4, 1]);
  assert.ok(visibleStaffIdleSlideIndexes(3, 48).length <= 3);
}

{
  assert.equal(
    staffIdleSlideshowMediaUrl("11111111-1111-4111-8111-111111111111"),
    "/api/staff/idle-slideshow/media/11111111-1111-4111-8111-111111111111"
  );
  assert.equal(
    staffIdleSlideshowStoragePath({
      gingr_ready_storage_path: "ready.jpg",
      thumbnail_storage_path: "thumb.jpg",
      original_storage_path: "orig.jpg"
    }),
    "thumb.jpg"
  );
  assert.equal(
    staffIdleSlideshowStoragePath({
      gingr_ready_storage_path: null,
      thumbnail_storage_path: "thumb.jpg",
      original_storage_path: "orig.jpg"
    }),
    "thumb.jpg"
  );
}

{
  const empty = getStaffBoardLayoutState({ checkInCount: 0, checkOutCount: 0, isLoaded: true });
  assert.equal(empty.showApprovedEmptyState, true);
  const singleIn = getStaffBoardLayoutState({ checkInCount: 2, checkOutCount: 0, isLoaded: true });
  assert.equal(singleIn.showApprovedEmptyState, false);
  const dual = getStaffBoardLayoutState({ checkInCount: 1, checkOutCount: 1, isLoaded: true });
  assert.equal(dual.showApprovedEmptyState, false);
  const loading = getStaffBoardLayoutState({ checkInCount: 0, checkOutCount: 0, isLoaded: false });
  assert.equal(loading.showApprovedEmptyState, false);
}

assert.equal(existsSync(join(process.cwd(), "app/api/staff/idle-slideshow/route.ts")), true);
assert.equal(
  existsSync(join(process.cwd(), "app/api/staff/idle-slideshow/media/[itemId]/route.ts")),
  true
);

{
  const listRoute = source("app/api/staff/idle-slideshow/route.ts");
  assert.match(listRoute, /loadStaffIdleSlideshowSlides/);
  assert.match(listRoute, /getOrLoadTtlCache|getTtlCache/);
  assert.match(listRoute, /warmStaffIdleSlideshowCacheInBackground|after\(/);
  assert.match(listRoute, /formatStaffIdleSlideshowLoadError/);
  assert.match(listRoute, /withTimeoutFallback/);
  assert.match(listRoute, /timeoutMs:\s*STAFF_IDLE_SLIDESHOW_DB_TIMEOUT_MS/);
  assert.match(listRoute, /STAFF_IDLE_SLIDESHOW_WARM_COOLDOWN_MS/);
  assert.match(listRoute, /slides:\s*\[\]/);
  assert.match(listRoute, /retrying:\s*true/);
  assert.doesNotMatch(listRoute, /status:\s*500/);
  assert.match(listRoute, /maxDuration\s*=\s*15/);

  const mediaRoute = source("app/api/staff/idle-slideshow/media/[itemId]/route.ts");
  assert.match(mediaRoute, /UUID_RE/);
  assert.match(mediaRoute, /staffIdleSlideshowStoragePath/);
  assert.match(mediaRoute, /createPhotoSignedUrl/);
  assert.match(mediaRoute, /withTimeoutFallback/);
  assert.match(mediaRoute, /STAFF_IDLE_SLIDESHOW_MEDIA_TIMEOUT_MS/);
  assert.match(mediaRoute, /media_kind === "video"/);
  assert.match(mediaRoute, /status === "failed"/);
  assert.match(mediaRoute, /maxDuration\s*=\s*15/);

  const loader = source("lib/staff/idle-slideshow.ts");
  assert.match(loader, /media_kind", "photo"/);
  assert.match(loader, /includeMediaKind: false/);
  assert.match(loader, /duplicate_of_item_id/);
  assert.match(loader, /STAFF_IDLE_SLIDESHOW_CACHE_KEY/);
  assert.match(loader, /STAFF_IDLE_SLIDESHOW_LOOKBACK_DAYS/);
  assert.match(loader, /gte\("created_at"/);
  assert.doesNotMatch(loader, /photo_upload_batches!inner/);
  assert.match(loader, /invalidateStaffIdleSlideshowCache/);
}

{
  // Empty staff board uses the All Clear mockup composition — not media-library slideshow.
  const emptyState = source("components/board/StaffBoardEmptyState.tsx");
  assert.match(emptyState, /All Clear,/);
  assert.match(emptyState, /staff-all-clear/);
  assert.match(emptyState, /all-clear-mockup\.jpg/);
  assert.match(emptyState, /Hydrate\./);
  assert.match(emptyState, /onSlideshowReady/);
  assert.doesNotMatch(emptyState, /\/api\/staff\/idle-slideshow/);
  assert.doesNotMatch(emptyState, /Loading media library photos/);
  assert.doesNotMatch(emptyState, /STAFF_IDLE_SLIDESHOW_POLL_MS/);
  assert.doesNotMatch(emptyState, /\/api\/admin\/photo-upload-queue/);
  assert.doesNotMatch(emptyState, /\/api\/lobby\/slideshow/);

  const css = source("app/globals.css");
  assert.match(css, /\.staff-all-clear\s*\{/);
  assert.match(css, /\.staff-all-clear__exact-art/);
  assert.match(css, /--all-clear-orange:\s*#ff6a00/);

  const boardClient = source("components/BoardClient.tsx");
  assert.match(boardClient, /staffBoardLayout\.showApprovedEmptyState/);
  assert.match(boardClient, /StaffBoardEmptyState/);
  assert.match(boardClient, /onSlideshowReady/);
  assert.match(boardClient, /staff-board-content--empty/);
  assert.match(boardClient, /staffBoardLayout\.showCheckInPanel/);
  assert.match(boardClient, /staffBoardLayout\.showCheckOutPanel/);
  assert.match(boardClient, /clockTime=\{dateTime\.time\}/);

  const lobby = source("components/lobby/LobbyCheckoutBoard.tsx");
  assert.doesNotMatch(lobby, /StaffBoardEmptyState/);
  assert.doesNotMatch(lobby, /idle-slideshow/);
}

console.log("test-staff-idle-slideshow: all assertions passed");
