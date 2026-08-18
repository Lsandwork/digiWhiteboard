import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStaffBoardLayoutState } from "../lib/staff/board-layout";
import {
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  STAFF_IDLE_SLIDESHOW_LIMIT,
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
  assert.match(listRoute, /slides:\s*\[\]/);
  assert.doesNotMatch(listRoute, /status:\s*500/);

  const mediaRoute = source("app/api/staff/idle-slideshow/media/[itemId]/route.ts");
  assert.match(mediaRoute, /UUID_RE/);
  assert.match(mediaRoute, /staffIdleSlideshowStoragePath/);
  assert.match(mediaRoute, /media_kind === "video"/);
  assert.match(mediaRoute, /status === "failed"/);

  const loader = source("lib/staff/idle-slideshow.ts");
  assert.match(loader, /media_kind", "photo"/);
  assert.match(loader, /duplicate_of_item_id/);
  assert.doesNotMatch(loader, /photo_upload_batches!inner/);
}

{
  const emptyState = source("components/board/StaffBoardEmptyState.tsx");
  assert.match(emptyState, /\/api\/staff\/idle-slideshow/);
  assert.match(emptyState, /visibleStaffIdleSlideIndexes/);
  assert.match(emptyState, /No dogs are currently checking/);
  assert.match(emptyState, /prefers-reduced-motion/);
  assert.match(emptyState, /STAFF_IDLE_SLIDESHOW_START_DELAY_MS/);
  assert.match(emptyState, /fetchPriority="low"/);
  assert.match(emptyState, /useDisplaySync/);
  assert.doesNotMatch(emptyState, /\/api\/admin\/photo-upload-queue/);
  assert.doesNotMatch(emptyState, /\/api\/lobby\/slideshow/);

  const css = source("app/globals.css");
  assert.match(css, /\.staff-idle-slideshow__image[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.staff-idle-slideshow__image\.is-active/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.staff-idle-slideshow__image \{\s*transition:\s*none;/
  );

  const boardClient = source("components/BoardClient.tsx");
  assert.match(boardClient, /staffBoardLayout\.showApprovedEmptyState/);
  assert.match(boardClient, /StaffBoardEmptyState/);
  assert.match(boardClient, /staff-board-content--empty/);
  assert.match(boardClient, /staffBoardLayout\.showCheckInPanel/);
  assert.match(boardClient, /staffBoardLayout\.showCheckOutPanel/);

  const lobby = source("components/lobby/LobbyCheckoutBoard.tsx");
  assert.doesNotMatch(lobby, /StaffBoardEmptyState/);
  assert.doesNotMatch(lobby, /idle-slideshow/);
}

console.log("test-staff-idle-slideshow: all assertions passed");
