import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import { canManageCastTv } from "../lib/cast-tv/permissions";
import { castTvErrorMessage, castTvErrorResponse } from "../lib/cast-tv/errors";
import { asCastTvFormFile } from "../lib/cast-tv/form-file";
import {
  inferCastTvMimeType,
  isHeicCastTvUpload,
  mediaTypeForMime,
  shouldUseCastTvServerUpload,
  validateCastTvUpload
} from "../lib/cast-tv/mime";
import { normalizeCastTvUploadBytes } from "../lib/cast-tv/normalize-upload";

assert.equal(inferCastTvMimeType("promo.jpg", ""), "image/jpeg");
assert.equal(inferCastTvMimeType("promo.JPG", "application/octet-stream"), "image/jpeg");
assert.equal(inferCastTvMimeType("promo.jpg", "image/jpg"), "image/jpeg");
assert.equal(inferCastTvMimeType("clip.mov", ""), "video/quicktime");
assert.equal(inferCastTvMimeType("phone.HEIC", ""), "image/heic");
assert.equal(isHeicCastTvUpload("IMG_1234.HEIC", ""), true);
assert.equal(isHeicCastTvUpload("yard.png", "image/png"), false);
assert.equal(mediaTypeForMime("", "board.webp"), "image");
assert.equal(mediaTypeForMime("image/jpg", "pic.jpg"), "image");

const jpeg = validateCastTvUpload({ name: "lobby.jpg", type: "", size: 120_000 });
assert.equal(jpeg.mediaType, "image");
assert.equal(jpeg.mimeType, "image/jpeg");

const heic = validateCastTvUpload({ name: "IMG_99.HEIC", type: "image/heic", size: 800_000 });
assert.equal(heic.mediaType, "image");
assert.equal(shouldUseCastTvServerUpload({ name: "IMG_99.HEIC", type: "image/heic", size: 800_000 }), true);
assert.equal(
  shouldUseCastTvServerUpload({ name: "lobby.jpg", type: "image/jpeg", size: 120_000 }),
  false,
  "typical JPEGs must use signed URLs, not Vercel FormData"
);
assert.equal(shouldUseCastTvServerUpload({ name: "huge.jpg", type: "image/jpeg", size: 8_000_000 }), false);

assert.throws(() => validateCastTvUpload({ name: "notes.txt", type: "text/plain", size: 12 }), /JPG/);

assert.equal(canManageCastTv(null, "marketing"), true);
assert.equal(canManageCastTv(null, "viewer"), false);
assert.equal(canManageCastTv(null, "owner_admin"), true);
assert.equal(
  canManageCastTv(accessFromLegacyRole("mkt-1", "marketing@fitdog.test", "marketing"), null),
  true,
  "marketing RBAC access can manage CAST-TV without a legacy role string"
);

const file = new File([new Uint8Array([1, 2, 3])], "promo.jpg", { type: "image/jpeg" });
const formFile = asCastTvFormFile(file);
assert.equal(formFile?.name, "promo.jpg");
assert.equal(formFile?.size, 3);
assert.equal(asCastTvFormFile("not-a-file"), null);

assert.match(castTvErrorMessage({ message: "AbortError: The user aborted a request." }, "fallback"), /timed out/);
const abortError = new Error("This operation was aborted");
abortError.name = "AbortError";
assert.match(castTvErrorMessage(abortError, "fallback"), /timed out/);
const timeoutResponse = castTvErrorResponse(abortError, "fallback");
assert.equal(timeoutResponse.status, 504);

const root = process.cwd();
const uploadClient = readFileSync(join(root, "lib/cast-tv/upload-client.ts"), "utf8");
assert.match(uploadClient, /credentials: "include"/);
assert.match(uploadClient, /\/api\/cast-tv\/media\/upload-url/);
assert.match(uploadClient, /\/api\/cast-tv\/media\/upload-complete/);
assert.match(uploadClient, /canFallbackToCastTvServerUpload/);
assert.match(uploadClient, /\/api\/cast-tv\/media\/upload/);
assert.doesNotMatch(
  uploadClient,
  /if \(shouldUseCastTvServerUpload\(file\)\) \{\s*\n\s*onProgress\?\.\(25\);/
);

const apiAuth = readFileSync(join(root, "lib/cast-tv/api-auth.ts"), "utf8");
assert.match(apiAuth, /canManageCastTv\(null, role\)/);
assert.match(apiAuth, /getEffectiveAdminRole/);
assert.match(apiAuth, /getCastTvSupabase/);
assert.match(apiAuth, /Unable to authorize CAST-TV/);

const uploadRoute = readFileSync(join(root, "app/api/cast-tv/media/upload/route.ts"), "utf8");
assert.match(uploadRoute, /normalizeCastTvUploadBytes/);
assert.match(uploadRoute, /uploadCastTvObject/);
assert.match(uploadRoute, /handleCastTvWrite/);
assert.match(uploadRoute, /asCastTvFormFile/);

const uploadUrlRoute = readFileSync(join(root, "app/api/cast-tv/media/upload-url/route.ts"), "utf8");
assert.match(uploadUrlRoute, /handleCastTvWrite/);

const uploadCompleteRoute = readFileSync(join(root, "app/api/cast-tv/media/upload-complete/route.ts"), "utf8");
assert.match(uploadCompleteRoute, /handleCastTvWrite/);
assert.match(uploadCompleteRoute, /convertStoredCastTvHeicIfNeeded/);

const normalizeUpload = readFileSync(join(root, "lib/cast-tv/normalize-upload.ts"), "utf8");
assert.doesNotMatch(normalizeUpload, /import sharp from/);

const mediaRoute = readFileSync(join(root, "app/api/cast-tv/media/route.ts"), "utf8");
assert.match(mediaRoute, /getCastTvSupabase/);
assert.match(mediaRoute, /maxDuration = 60/);
assert.match(mediaRoute, /castTvErrorMessage/);

const supabaseHelper = readFileSync(join(root, "lib/cast-tv/supabase.ts"), "utf8");
assert.match(supabaseHelper, /CAST_TV_SUPABASE_TIMEOUT_MS = 30_000/);

const nextConfig = readFileSync(join(root, "next.config.mjs"), "utf8");
assert.match(nextConfig, /"sharp"/);

const migration = readFileSync(join(root, "supabase/migrations/087_cast_tv_media_upload.sql"), "utf8");
assert.match(migration, /image\/heic/);
assert.match(migration, /cast_tv_media_signed_insert/);

const media = readFileSync(join(root, "lib/cast-tv/media.ts"), "utf8");
assert.match(media, /ensureCastTvBucket/);
assert.match(media, /Bucket probe failed/);
assert.doesNotMatch(media, /\.maybeSingle\(\);\s*\n\s*if \(error && error\.code !== "42P01"\) throw error;\s*\n\s*return \(data as CastTvMediaRecord \| null\)/);

console.log("cast-tv upload tests passed");

async function testJpegIngest() {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 111, b: 38 } }
  })
    .jpeg()
    .toBuffer();
  const normalized = await normalizeCastTvUploadBytes({
    name: "Promo Photo.JPG",
    type: "",
    size: jpeg.length,
    arrayBuffer: async () => {
      const copy = Uint8Array.from(jpeg);
      return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    }
  });
  assert.equal(normalized.mimeType, "image/jpeg");
  assert.equal(normalized.mediaType, "image");
  assert.match(normalized.storagePath, /^media\/.+\.jpg$/);
  assert.ok(normalized.fileSize > 0);
}

void testJpegIngest()
  .then(() => {
    console.log("cast-tv upload ingest tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
