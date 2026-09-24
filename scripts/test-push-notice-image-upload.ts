import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opsAlertFromActiveAlert, opsAlertFromStaffPushNotice } from "../lib/ops-alert/from-staff-push";
import {
  assertPushNoticeImageUpload,
  normalizePushNoticeImageUrl
} from "../lib/staff/push-notice-image-upload";
import { normalizeNoticeInput, type StaffPushNotice } from "../lib/staff/push-notices";
import { resolveStaffCastDisplay } from "../lib/whiteboard/staff-active-alert";
import type { StaffWhiteboardStatePayload } from "../lib/whiteboard/state";

const root = process.cwd();

assert.equal(normalizePushNoticeImageUrl(""), null);
assert.equal(normalizePushNoticeImageUrl(null), null);
assert.equal(
  normalizePushNoticeImageUrl("https://cdn.example.com/notices/yard.jpg"),
  "https://cdn.example.com/notices/yard.jpg"
);
assert.equal(normalizePushNoticeImageUrl("/api/media/notice.jpg"), "/api/media/notice.jpg");
assert.ok(
  normalizePushNoticeImageUrl("data:image/png;base64,aaaa")?.startsWith("data:image/png")
);
assert.throws(() => normalizePushNoticeImageUrl("javascript:alert(1)"), /http or https/i);
assert.throws(() => normalizePushNoticeImageUrl("ftp://files.example.com/a.jpg"), /http or https/i);

const meta = assertPushNoticeImageUpload({
  name: "yard-photo.PNG",
  type: "image/png",
  size: 1200
});
assert.equal(meta.contentType, "image/png");
assert.match(meta.filename, /yard-photo/i);
assert.throws(
  () => assertPushNoticeImageUpload({ name: "notes.pdf", type: "application/pdf", size: 100 }),
  /JPG, PNG, WEBP, or GIF/i
);
assert.throws(
  () => assertPushNoticeImageUpload({ name: "big.jpg", type: "image/jpeg", size: 4 * 1024 * 1024 }),
  /3\.5 MB/i
);

const normalized = normalizeNoticeInput({
  title: "Yard photo notice",
  message: "See attached photo",
  image_url: "https://cdn.example.com/push/yard.jpg",
  priority: "important",
  display_mode: "normal"
});
assert.equal(normalized.image_url, "https://cdn.example.com/push/yard.jpg");

const notice = {
  id: "notice-img-1",
  title: "Yard photo notice",
  message: "See attached photo",
  image_url: "https://cdn.example.com/push/yard.jpg",
  priority: "important",
  display_mode: "normal",
  is_active: true,
  is_default: false,
  created_at: "2026-09-24T12:00:00.000Z",
  updated_at: "2026-09-24T12:00:00.000Z",
  expires_at: "2026-09-24T12:05:00.000Z",
  created_by: null,
  updated_by: null,
  pushed_at: "2026-09-24T12:00:00.000Z",
  cleared_at: null
} as StaffPushNotice;

const alert = opsAlertFromStaffPushNotice(notice);
assert.equal(alert.mediaUrl, "https://cdn.example.com/push/yard.jpg");
assert.equal(alert.mediaAlt, "Yard photo notice");

const emptyPayload: StaffWhiteboardStatePayload = {
  boardType: "staff",
  checkingInDogs: [],
  checkingOutDogs: [],
  activePushNotice: {
    id: "notice-img-1",
    title: "Yard photo notice",
    message: "See attached photo",
    image_url: "https://cdn.example.com/push/yard.jpg",
    priority: "normal",
    display_mode: "normal",
    expires_at: "2026-09-24T12:05:00.000Z",
    is_daily_reminder: false
  },
  activeGroomingPush: null,
  activeDailyReminder: null,
  activeVideoPush: null,
  footerMessage: null,
  lastUpdated: "2026-09-24T12:00:00.000Z"
};

const castMode = resolveStaffCastDisplay(emptyPayload);
assert.equal(castMode.mode, "push_takeover");
if (castMode.mode === "push_takeover") {
  const castAlert = opsAlertFromActiveAlert(castMode.alert);
  assert.equal(castAlert.mediaUrl, "https://cdn.example.com/push/yard.jpg");
}

const textOnly = resolveStaffCastDisplay({
  ...emptyPayload,
  activePushNotice: {
    ...emptyPayload.activePushNotice!,
    image_url: null,
    priority: "normal",
    display_mode: "normal"
  }
});
assert.equal(textOnly.mode, "dashboard", "text-only normal notices stay on dashboard");

const panel = readFileSync(join(root, "components/admin/PushNoticesPanel.tsx"), "utf8");
assert.match(panel, /Upload image/);
assert.match(panel, /\/api\/admin\/push-notices\/upload-image/);
assert.match(panel, /image_url/);
assert.match(panel, /3\.5 MB/);

const uploadRoute = readFileSync(join(root, "app/api/admin/push-notices/upload-image/route.ts"), "utf8");
assert.match(uploadRoute, /uploadPushNoticeImage/);
assert.match(uploadRoute, /canUseStandardOrEmergencyPush/);
assert.match(uploadRoute, /asCastTvFormFile/);
assert.doesNotMatch(uploadRoute, /instanceof\s+File/);

const helper = readFileSync(join(root, "lib/staff/push-notice-image-upload.ts"), "utf8");
assert.match(helper, /push-notices\//);
assert.match(helper, /LOBBY_SLIDESHOW_BUCKET/);
assert.match(helper, /3_500_000/);

const whiteboardState = readFileSync(join(root, "lib/whiteboard/state.ts"), "utf8");
assert.match(whiteboardState, /image_url:\s*optimizeCastPhotoUrl\(notice\.image_url\)/);

const css = readFileSync(join(root, "components/ops-alert/OpsAlert.module.css"), "utf8");
assert.match(css, /\.cardFullscreen \.media/);

console.log("push-notice image upload checks passed");
