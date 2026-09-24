import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opsAlertFromStaffPushNotice } from "../lib/ops-alert/from-staff-push";
import {
  assertPushNoticeImageUpload,
  normalizePushNoticeImageUrl
} from "../lib/staff/push-notice-image-upload";
import { normalizeNoticeInput, type StaffPushNotice } from "../lib/staff/push-notices";

const root = process.cwd();

assert.equal(normalizePushNoticeImageUrl(""), null);
assert.equal(normalizePushNoticeImageUrl(null), null);
assert.equal(
  normalizePushNoticeImageUrl("https://cdn.example.com/notices/yard.jpg"),
  "https://cdn.example.com/notices/yard.jpg"
);
assert.equal(normalizePushNoticeImageUrl("/api/media/notice.jpg"), "/api/media/notice.jpg");
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
  () => assertPushNoticeImageUpload({ name: "big.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 }),
  /5 MB/i
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

const panel = readFileSync(join(root, "components/admin/PushNoticesPanel.tsx"), "utf8");
assert.match(panel, /Upload image/);
assert.match(panel, /\/api\/admin\/push-notices\/upload-image/);
assert.match(panel, /image_url/);

const uploadRoute = readFileSync(join(root, "app/api/admin/push-notices/upload-image/route.ts"), "utf8");
assert.match(uploadRoute, /uploadPushNoticeImage/);
assert.match(uploadRoute, /canUseStandardOrEmergencyPush/);

const helper = readFileSync(join(root, "lib/staff/push-notice-image-upload.ts"), "utf8");
assert.match(helper, /push-notices\//);
assert.match(helper, /LOBBY_SLIDESHOW_BUCKET/);

const whiteboardState = readFileSync(join(root, "lib/whiteboard/state.ts"), "utf8");
assert.match(whiteboardState, /image_url:\s*optimizeCastPhotoUrl\(notice\.image_url\)/);

console.log("push-notice image upload checks passed");
