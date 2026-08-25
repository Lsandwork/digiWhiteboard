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
import {
  builtinMarketingCastTvMedia,
  emptyCastTvLibrary,
  isMissingCastTvStorageObject,
  mergeCastTvLibraries,
  mergeCastTvStorageObjects,
  parseCastTvLibrary
} from "../lib/cast-tv/library-store";
import { LOBBY_IDLE_SLIDESHOW } from "../lib/lobby/slideshow";
import { mediaRecordToPlaylistItem } from "../lib/cast-tv/media";

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

const parsedLibrary = parseCastTvLibrary({
  media: [
    {
      id: "slide-1",
      file_name: "yard.jpg",
      storage_path: "cast-tv/slide-1.jpg",
      public_url: "https://cdn.example/yard.jpg",
      media_type: "image",
      image_display_seconds: 10,
      display_order: 1,
      is_enabled: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    }
  ]
});
assert.equal(parsedLibrary.media.length, 1);
assert.equal(parsedLibrary.media[0].file_name, "yard.jpg");
assert.equal(mediaRecordToPlaylistItem(parsedLibrary.media[0]).src, "https://cdn.example/yard.jpg");
assert.equal(parseCastTvLibrary(null).media.length, 0);
assert.equal(emptyCastTvLibrary().settings.default_image_seconds, 10);
assert.equal(isMissingCastTvStorageObject({ statusCode: "404", message: "Object not found" }), true);
assert.equal(isMissingCastTvStorageObject({ statusCode: "403", message: "Unauthorized" }), false);

const recovered = mergeCastTvStorageObjects(
  emptyCastTvLibrary(),
  [{ name: "slide-9.jpg", created_at: "2026-01-02T00:00:00.000Z", metadata: { size: 12, mimetype: "image/jpeg" } }],
  (path) => `https://cdn.example/${path}`
);
assert.equal(recovered.added, 1);
assert.equal(recovered.library.media[0].storage_path, "cast-tv/slide-9.jpg");
assert.match(recovered.library.media[0].public_url, /cast-tv\/slide-9\.jpg/);
assert.equal(
  mergeCastTvStorageObjects(recovered.library, [{ name: "library.json" }], () => "").added,
  0
);

const builtins = builtinMarketingCastTvMedia();
assert.equal(builtins.length, LOBBY_IDLE_SLIDESHOW.length);
assert.ok(builtins.every((item) => item.is_enabled && item.public_url?.startsWith("/assets/")));
assert.equal(
  mergeCastTvLibraries(emptyCastTvLibrary(), { ...emptyCastTvLibrary(), media: builtins }).added,
  builtins.length
);
assert.equal(
  mergeCastTvLibraries(
    { ...emptyCastTvLibrary(), media: builtins },
    { ...emptyCastTvLibrary(), media: builtins }
  ).added,
  0,
  "designed marketing slides must not duplicate"
);
const restored = mergeCastTvLibraries(emptyCastTvLibrary(), parsedLibrary);
assert.equal(restored.added, 1);
assert.equal(restored.library.media[0].file_name, "yard.jpg");

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
assert.match(
  castTvErrorMessage({ message: "<!DOCTYPE html> supabase.co | 525: SSL handshake failed" }, "fallback"),
  /storage is temporarily unavailable/
);

const root = process.cwd();
const uploadClient = readFileSync(join(root, "lib/cast-tv/upload-client.ts"), "utf8");
assert.match(uploadClient, /credentials: "include"/);
assert.match(uploadClient, /\/api\/cast-tv\/media\/upload-url/);
assert.match(uploadClient, /\/api\/cast-tv\/media\/upload-complete/);
assert.match(uploadClient, /validateCastTvUpload/);
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
assert.match(apiAuth, /accessFromLegacyRole/);
assert.match(apiAuth, /ACCESS_LOOKUP_MS/);

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
assert.match(mediaRoute, /loadCastTvMedia/);
assert.match(mediaRoute, /playlist/);
assert.match(mediaRoute, /admin: true/);
assert.doesNotMatch(mediaRoute, /buildCastTvPlaylist/);

const supabaseHelper = readFileSync(join(root, "lib/cast-tv/supabase.ts"), "utf8");
assert.match(supabaseHelper, /CAST_TV_SUPABASE_TIMEOUT_MS = 15_000/);

const nextConfig = readFileSync(join(root, "next.config.mjs"), "utf8");
assert.match(nextConfig, /"sharp"/);

const migration = readFileSync(join(root, "supabase/migrations/087_cast_tv_media_upload.sql"), "utf8");
assert.match(migration, /image\/heic/);
assert.match(migration, /cast_tv_media_signed_insert/);

const media = readFileSync(join(root, "lib/cast-tv/media.ts"), "utf8");
assert.match(media, /CAST_TV_STORAGE_BUCKET/);
assert.match(media, /loadCastTvLibrary/);
assert.match(media, /mutateCastTvLibrary/);
assert.match(media, /mutateCastTvHeartbeats/);
assert.doesNotMatch(media, /\.from\("cast_tv_media"\)/);

const libraryStore = readFileSync(join(root, "lib/cast-tv/library-store.ts"), "utf8");
assert.match(libraryStore, /cast-tv\/library\.json/);
assert.match(libraryStore, /CAST_TV_LEGACY_MEDIA_BUCKET = "cast-tv-media"/);
assert.match(libraryStore, /CAST_TV_LIBRARY_SETTINGS_KEY = "cast_tv_library"/);
assert.match(libraryStore, /CAST_TV_LAST_GOOD_CACHE_KEY/);
assert.match(libraryStore, /builtinMarketingCastTvMedia/);
assert.match(libraryStore, /loadLegacySettingsLibrary/);
assert.match(libraryStore, /withTimeoutFallback/);
assert.match(libraryStore, /\.download\(/);
assert.match(libraryStore, /JSON_UPLOAD_MIME/);

const storageProbe = readFileSync(join(root, "lib/system-health/probes/storage.ts"), "utf8");
assert.doesNotMatch(storageProbe, /\.from\("cast_tv_media"\)/);
assert.match(storageProbe, /list\("cast-tv"/);

const panel = readFileSync(join(root, "components/admin/CastTvPanel.tsx"), "utf8");
assert.doesNotMatch(panel, /postgres_changes/);
const tvPlayer = readFileSync(join(root, "components/cast-tv/useCastTvPlaylist.ts"), "utf8");
assert.doesNotMatch(tvPlayer, /postgres_changes/);
assert.match(tvPlayer, /currentIdRef\.current/);

const libraryMigration = readFileSync(join(root, "supabase/migrations/088_cast_tv_library_storage.sql"), "utf8");
assert.match(libraryMigration, /application\/json/);
assert.match(libraryMigration, /lobby-slideshow/);

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
  assert.match(normalized.storagePath, /^cast-tv\/.+\.jpg$/);
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
