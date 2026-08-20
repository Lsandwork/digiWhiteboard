import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

{
  const takeover = source("components/boards/TlBoardPushTakeover.tsx");
  assert.match(takeover, /useStaffBoardOverlays\(\{ department: "tl_alerts_reminders" \}\)/);
  assert.match(takeover, /StaffPushNoticeFullscreen/);
  assert.match(takeover, /GroomingPushNoticeOverlay/);
  assert.match(takeover, /TrainerPushNoticeOverlay/);
  assert.match(takeover, /CastVideoOverlay/);
  assert.doesNotMatch(takeover, /onMinimize/);
  assert.doesNotMatch(takeover, /boardMode/);
  assert.doesNotMatch(takeover, /StaffPushNoticePanel/);
  assert.match(takeover, /tl-board-push-takeover/);
}

{
  const board = source("components/boards/TlAlertsRemindersBoard.tsx");
  assert.match(board, /TlBoardPushTakeover/);
  assert.doesNotMatch(board, /useStaffBoardOverlays/);
  assert.doesNotMatch(board, /\/api\/staff\/board-overlays/);
}

{
  const css = source("components/boards/tl-alerts-reminders-board.css");
  assert.match(css, /\.tl-board-push-takeover[\s\S]*position:\s*fixed/);
}

console.log("test-tl-board-push-takeover: all assertions passed");
