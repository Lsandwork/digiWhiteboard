import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import { canManageCastTv } from "../lib/cast-tv/permissions";
import { castTvErrorMessage, castTvErrorResponse, isCastTvSharpLoadError } from "../lib/cast-tv/errors";
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
  parseCastTvLibrary,
  parseCastTvRefreshNonce
} from "../lib/cast-tv/library-store";
import { loadSharp } from "../lib/sharp-runtime";
import { LOBBY_IDLE_SLIDESHOW } from "../lib/lobby/slideshow";
import { mediaRecordToPlaylistItem } from "../lib/cast-tv/media";
import {
  CAST_TV_ADMIN_PAGE_SIZE,
  paginateCastTvAdminMedia
} from "../lib/cast-tv/admin-list";
import { isCastTvQueryLogEnabled } from "../lib/cast-tv/query-log";
import { CAST_TV_PLAYLIST_CACHE_MS } from "../lib/cast-tv/client-cache";
import { castTvFileThumbSrc, castTvStorageThumbUrl } from "../lib/cast-tv/thumbs";
import {
  CAST_TV_DUPLICATE_MESSAGE,
  isLegacyCastTvDumpPath,
  isRecoverableCastTvStoragePath,
  matchCastTvDuplicate,
  purgeDuplicateCastTvMedia,
  sniffCastTvImageKind,
  transcodeCastTvDisplayImage
} from "../lib/cast-tv/display-image";
import type { CastTvMediaRecord } from "../lib/cast-tv/types";

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
assert.match(mediaRecordToPlaylistItem(parsedLibrary.media[0]).src, /\/api\/cast-tv\/media\/file\?id=slide-1/);
assert.equal(parseCastTvLibrary(null).media.length, 0);
assert.equal(emptyCastTvLibrary().settings.default_image_seconds, 10);
assert.equal(parseCastTvRefreshNonce({ nonce: 42 }), 42);
assert.equal(parseCastTvRefreshNonce({ nonce: -3 }), 0);
assert.equal(parseCastTvRefreshNonce(null), 0);
assert.equal(
  mergeCastTvStorageObjects(emptyCastTvLibrary(), [{ name: "refresh.json" }], () => "").added,
  0
);
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
assert.equal(
  mergeCastTvStorageObjects(recovered.library, [{ name: "cast-tv/library.json" }], () => "").added,
  0
);
assert.equal(
  mergeCastTvStorageObjects(recovered.library, [{ name: "slide-9.jpg" }], () => "").added,
  0,
  "same storage object must not be recovered twice"
);
assert.equal(isLegacyCastTvDumpPath("media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg"), true);
assert.equal(isRecoverableCastTvStoragePath("media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg"), false);
assert.equal(isRecoverableCastTvStoragePath("cast-tv/072edb55-e287-4204-890c-b2119c25d044.jpg"), true);
assert.equal(
  mergeCastTvStorageObjects(
    emptyCastTvLibrary(),
    [
      {
        name: "media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg",
        metadata: { size: 136221, mimetype: "image/jpeg" }
      }
    ],
    () => "https://cdn.example/media/dup.jpg",
    { bucket: "cast-tv-media", pathPrefix: "" }
  ).added,
  0,
  "legacy media/ dump objects must not be recovered into the slideshow"
);
assert.equal(
  mergeCastTvStorageObjects(
    recovered.library,
    [{ name: "media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg", metadata: { mimetype: "image/jpeg" } }],
    () => ""
  ).added,
  0,
  "media/ dump names must not remap into cast-tv/"
);

function testMedia(
  id: string,
  storagePath: string,
  extra: Partial<CastTvMediaRecord> = {}
): CastTvMediaRecord {
  return {
    id,
    display_name: null,
    file_name: extra.file_name || `${id}.jpg`,
    storage_path: storagePath,
    bucket: extra.bucket ?? "lobby-slideshow",
    public_url: extra.public_url ?? `https://cdn.example/${storagePath}`,
    media_type: extra.media_type ?? "image",
    mime_type: "image/jpeg",
    file_size_bytes: extra.file_size_bytes ?? 120000,
    duration_seconds: null,
    image_display_seconds: 10,
    display_order: extra.display_order ?? 1,
    is_enabled: extra.is_enabled ?? true,
    uploaded_by: null,
    uploaded_by_name: null,
    created_at: extra.created_at ?? "2026-08-25T00:00:00.000Z",
    updated_at: extra.updated_at ?? "2026-08-25T00:00:00.000Z",
    content_hash: extra.content_hash ?? null,
    pixel_hash: extra.pixel_hash ?? null,
    display_ready: extra.display_ready ?? false
  };
}

const liveCanonical = testMedia("072edb55-e287-4204-890c-b2119c25d044", "cast-tv/072edb55-e287-4204-890c-b2119c25d044.jpg", {
  file_size_bytes: 136221,
  content_hash: "61af2c206f822d30",
  display_order: 1
});
const liveDumpCopy = testMedia("media/246a20a4-3dfd-42b9-8264-18134f143c8d", "media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg", {
  bucket: "cast-tv-media",
  file_size_bytes: 136221,
  content_hash: "61af2c206f822d30",
  display_order: 23
});
const uniqueDump = testMedia("media/06a42907-5b46-4c8a-b236-cdc9820f1790", "media/06a42907-5b46-4c8a-b236-cdc9820f1790.jpg", {
  bucket: "cast-tv-media",
  file_size_bytes: 498264,
  display_order: 24
});
const dumpVideo = testMedia("media/388f3661-abff-4e1c-955c-68c79ea3e1e3", "media/388f3661-abff-4e1c-955c-68c79ea3e1e3.mp4", {
  bucket: "cast-tv-media",
  media_type: "video",
  display_order: 25
});

const purgedLive = purgeDuplicateCastTvMedia([liveDumpCopy, uniqueDump, dumpVideo, liveCanonical]);
assert.equal(purgedLive.kept.length, 1);
assert.equal(purgedLive.kept[0].id, liveCanonical.id);
assert.equal(purgedLive.removed.length, 3);
assert.ok(purgedLive.removed.every((item) => item.storage_path.startsWith("media/")));

const dumpOnly = purgeDuplicateCastTvMedia([uniqueDump, dumpVideo]);
assert.equal(dumpOnly.kept.length, 2, "do not empty CAST-TV when the dump is the only playlist");
assert.equal(dumpOnly.removed.length, 0);

const hashedDupes = purgeDuplicateCastTvMedia([
  testMedia("dump-first", "media/dump-first.jpg", {
    bucket: "cast-tv-media",
    content_hash: "same-pixels",
    display_order: 1
  }),
  testMedia("keep-cast-tv", "cast-tv/keep-cast-tv.jpg", {
    content_hash: "same-pixels",
    display_order: 2
  })
]);
assert.deepEqual(
  hashedDupes.kept.map((item) => item.id),
  ["keep-cast-tv"],
  "keep the cast-tv/ copy over a media/ dump even when the dump is listed first"
);

const namedOverUuid = purgeDuplicateCastTvMedia([
  testMedia("uuid-copy", "cast-tv/uuid-copy.jpg", {
    file_name: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg",
    content_hash: "same-photo",
    display_order: 1
  }),
  testMedia("named-copy", "cast-tv/named-copy.jpg", {
    file_name: "Yard Day.jpg",
    content_hash: "same-photo",
    display_order: 2
  })
]);
assert.equal(namedOverUuid.kept.length, 1);
assert.equal(namedOverUuid.kept[0].id, "named-copy");
assert.equal(namedOverUuid.removed[0].id, "uuid-copy");

const seededBuiltins = builtinMarketingCastTvMedia();
const repairDisabledUpload = testMedia(
  "f0084c59-a850-41e3-b0bd-da0fdb7a75b1",
  "cast-tv/f0084c59-a850-41e3-b0bd-da0fdb7a75b1.jpg",
  { is_enabled: false, display_ready: false, display_order: 2 }
);
const restoredUploads = purgeDuplicateCastTvMedia([
  seededBuiltins[0],
  repairDisabledUpload,
  seededBuiltins[1],
  testMedia("072edb55-e287-4204-890c-b2119c25d044", "cast-tv/072edb55-e287-4204-890c-b2119c25d044.jpg", {
    is_enabled: false,
    display_ready: false,
    display_order: 4
  })
]);
assert.equal(restoredUploads.kept.length, 2);
assert.ok(restoredUploads.kept.every((item) => item.is_enabled && item.storage_path.startsWith("cast-tv/")));
assert.ok(restoredUploads.removed.every((item) => String(item.id).startsWith("builtin-marketing-")));

const userHidden = purgeDuplicateCastTvMedia([
  testMedia("keep-on", "cast-tv/keep-on.jpg", { is_enabled: true, display_ready: true, display_order: 1 }),
  testMedia("user-off", "cast-tv/user-off.jpg", { is_enabled: false, display_ready: true, display_order: 2 })
]);
assert.deepEqual(
  userHidden.kept.map((item) => [item.id, item.is_enabled]),
  [
    ["keep-on", true],
    ["user-off", false]
  ],
  "user-disabled display-ready photos stay hidden"
);

assert.equal(purgeDuplicateCastTvMedia(seededBuiltins).kept.length, seededBuiltins.length);

const parsedWithoutDump = parseCastTvLibrary({
  media: [liveCanonical, liveDumpCopy, uniqueDump]
});
assert.equal(parsedWithoutDump.media.length, 1);
assert.equal(parsedWithoutDump.media[0].id, liveCanonical.id);

assert.equal(
  mergeCastTvStorageObjects(parsedWithoutDump, [
    { name: "media/246a20a4-3dfd-42b9-8264-18134f143c8d.jpg", metadata: { mimetype: "image/jpeg" } }
  ], () => "", { pathPrefix: "" }).added,
  0,
  "purged dump files must not be recovered again"
);

const jsonRejected = sniffCastTvImageKind(Buffer.from('{"media":[]}'));
assert.equal(jsonRejected, "json");

const duplicateByName = matchCastTvDuplicate(parsedLibrary.media, { fileName: "YARD.JPG" });
assert.equal(duplicateByName?.id, "slide-1");
assert.equal(
  matchCastTvDuplicate(parsedLibrary.media, { fileName: "f0084c59-a850-41e3-b0bd-da0fdb7a75b1.jpg" }),
  null,
  "UUID storage names are not duplicate keys"
);
assert.match(CAST_TV_DUPLICATE_MESSAGE, /already on CAST-TV/);

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
assert.equal(
  mergeCastTvLibraries(parsedWithoutDump, {
    ...emptyCastTvLibrary(),
    media: [liveDumpCopy, uniqueDump]
  }).added,
  0,
  "canonical slideshow must not re-absorb media/ dump copies"
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
assert.match(
  castTvErrorMessage({ message: "<!DOCTYPE html> supabase.co | 525: SSL handshake failed" }, "fallback"),
  /storage is temporarily unavailable/
);
assert.equal(
  isCastTvSharpLoadError({
    message:
      'Failed to load external module sharp-20c6a5da84e2135f: Error: Could not load the "sharp" module using the linux-x64 runtime ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file'
  }),
  true
);
assert.match(
  castTvErrorMessage({
    message:
      'Failed to load external module sharp-20c6a5da84e2135f: Error: Could not load the "sharp" module using the linux-x64 runtime ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3'
  }, "fallback"),
  /photo processing is temporarily unavailable/
);
const sharpResponse = castTvErrorResponse(
  { message: 'Could not load the "sharp" module using the linux-x64 runtime ERR_DLOPEN_FAILED' },
  "fallback"
);
assert.equal(sharpResponse.status, 503);

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
assert.match(uploadCompleteRoute, /normalizeStoredCastTvImage/);
assert.doesNotMatch(uploadCompleteRoute, /library save after upload failed/);

const normalizeUpload = readFileSync(join(root, "lib/cast-tv/normalize-upload.ts"), "utf8");
assert.doesNotMatch(normalizeUpload, /import sharp from/);

const mediaRoute = readFileSync(join(root, "app/api/cast-tv/media/route.ts"), "utf8");
assert.match(mediaRoute, /loadCastTvLibrary/);
assert.match(mediaRoute, /playlist/);
assert.match(mediaRoute, /admin: true/);
assert.match(mediaRoute, /paginateCastTvAdminMedia/);
assert.match(mediaRoute, /playlistOnly/);
assert.match(mediaRoute, /probeAndMarkMissingCastTvMedia/);
assert.match(mediaRoute, /storage_missing/);
assert.doesNotMatch(mediaRoute, /repairCastTvLibraryImages/);
assert.doesNotMatch(mediaRoute, /buildCastTvPlaylist/);

const settingsRoute = readFileSync(join(root, "app/api/cast-tv/settings/route.ts"), "utf8");
assert.match(settingsRoute, /castHardReloadNonce/);
assert.match(settingsRoute, /loadCastHardReloadNonce/);
assert.match(settingsRoute, /mediaRevision/);
assert.match(settingsRoute, /trigger: "settings"/);

const supabaseHelper = readFileSync(join(root, "lib/cast-tv/supabase.ts"), "utf8");
assert.match(supabaseHelper, /CAST_TV_SUPABASE_TIMEOUT_MS = 15_000/);

const nextConfig = readFileSync(join(root, "next.config.mjs"), "utf8");
assert.match(nextConfig, /"sharp"/);
assert.match(nextConfig, /@img\/sharp-libvips-linux-x64/);
assert.match(nextConfig, /@img\/sharp-wasm32/);
assert.match(nextConfig, /\/api\/\*\*/);
assert.match(nextConfig, /\/api\/cast-tv\/media\/upload/);

const migration = readFileSync(join(root, "supabase/migrations/087_cast_tv_media_upload.sql"), "utf8");
assert.match(migration, /image\/heic/);
assert.match(migration, /cast_tv_media_signed_insert/);

const media = readFileSync(join(root, "lib/cast-tv/media.ts"), "utf8");
assert.match(media, /CAST_TV_STORAGE_BUCKET/);
assert.match(media, /loadCastTvLibrary/);
assert.match(media, /mutateCastTvLibrary/);
assert.match(media, /mutateCastTvHeartbeats/);
assert.match(media, /deleteCastTvMediaRecords/);
assert.doesNotMatch(media, /\.from\("cast_tv_media"\)/);

const libraryStore = readFileSync(join(root, "lib/cast-tv/library-store.ts"), "utf8");
assert.match(libraryStore, /cast-tv\/library\.json/);
assert.match(libraryStore, /CAST_TV_LEGACY_MEDIA_BUCKET = "cast-tv-media"/);
assert.match(libraryStore, /CAST_TV_LIBRARY_SETTINGS_KEY = "cast_tv_library"/);
assert.match(libraryStore, /CAST_TV_LAST_GOOD_CACHE_KEY/);
assert.match(libraryStore, /builtinMarketingCastTvMedia/);
assert.match(libraryStore, /loadLegacySettingsLibrary/);
assert.match(libraryStore, /withTimeoutFallback/);
assert.match(libraryStore, /cast-tv\/refresh\.json/);
assert.match(libraryStore, /CAST_TV_STORAGE_BUCKET = "lobby-slideshow"/);
assert.match(libraryStore, /\.download\(/);
assert.match(libraryStore, /JSON_UPLOAD_MIME/);
assert.match(libraryStore, /purgeDuplicateCastTvMedia/);
assert.match(libraryStore, /deleteRemovedCastTvStorage/);
assert.match(libraryStore, /isLegacyCastTvDumpPath/);
assert.match(libraryStore, /name\.toLowerCase\(\) === "media"/);
assert.match(libraryStore, /\{ bucket: CAST_TV_STORAGE_BUCKET, prefix: "cast-tv" \}/);
assert.match(libraryStore, /\{ bucket: CAST_TV_LEGACY_MEDIA_BUCKET, prefix: "cast-tv" \}/);
assert.doesNotMatch(libraryStore, /\{ bucket: [^,]+, prefix: "" \}/);

assert.match(libraryStore, /isUploadedCastTvMedia/);
assert.match(libraryStore, /hasUploaded/);
assert.match(libraryStore, /storage\.library\.json\.public/);
assert.match(libraryStore, /AbortSignal\.timeout\(4_000\)/);
assert.match(libraryStore, /recoverOrphans === true/);
assert.match(libraryStore, /includeLegacy === true/);
assert.doesNotMatch(libraryStore, /recoverOrphans !== false/);
assert.doesNotMatch(libraryStore, /includeLegacy !== false/);

const repairImages = readFileSync(join(root, "lib/cast-tv/repair-images.ts"), "utf8");
assert.match(repairImages, /deleteRemovedCastTvStorage/);
assert.match(repairImages, /removed\.push\(item\)/);
assert.match(repairImages, /isTransientCastTvStorageError/);
assert.doesNotMatch(
  repairImages,
  /catch \{\s*nextMedia\.push\(\{ \.\.\.item, is_enabled: false \}\)/
);

const storageProbe = readFileSync(join(root, "lib/system-health/probes/storage.ts"), "utf8");
assert.doesNotMatch(storageProbe, /\.from\("cast_tv_media"\)/);
assert.match(storageProbe, /list\("cast-tv"/);

const panel = readFileSync(join(root, "components/admin/CastTvPanel.tsx"), "utf8");
assert.doesNotMatch(panel, /postgres_changes/);
assert.match(panel, /Skipped a duplicate photo/);
assert.match(panel, /\/api\/cast-tv\/media\/file/);
assert.match(panel, /\/api\/cast-tv\/media\/bulk-delete/);
assert.match(panel, /Delete selected/);
assert.match(panel, /selectedIds/);
assert.match(panel, /date\.getTime\(\) === 0/);
assert.match(panel, /async function moveMedia/);
assert.match(panel, /DndContext/);
assert.match(panel, /SortableContext/);
assert.match(panel, /arrayMove/);
assert.match(panel, /orderedIds/);
assert.match(panel, /Shift-click/);
assert.match(panel, /toggleRowSelected/);
assert.match(panel, /lastActiveSelectIndexRef/);
assert.match(panel, /CAST_TV_ADMIN_PAGE_SIZE/);
assert.match(panel, /status: "disabled"/);
assert.match(panel, /document\.hidden/);
assert.match(panel, /AbortController/);
assert.match(panel, /thumb_url/);
assert.match(panel, /storage_missing/);
assert.match(panel, /Load more/);
assert.match(panel, /castTvFileThumbSrc/);

const bulkDeleteRoute = readFileSync(join(root, "app/api/cast-tv/media/bulk-delete/route.ts"), "utf8");
assert.match(bulkDeleteRoute, /deleteCastTvMediaRecords/);
assert.match(bulkDeleteRoute, /cast_tv\.media\.bulk_deleted/);

const packageJson = readFileSync(join(root, "package.json"), "utf8");
assert.match(packageJson, /@img\/sharp-wasm32/);
assert.match(packageJson, /@img\/sharp-libvips-linux-x64/);
assert.match(packageJson, /@img\/sharp-linux-x64/);

const sharpRuntime = readFileSync(join(root, "lib/sharp-runtime.ts"), "utf8");
assert.match(sharpRuntime, /ensureSharpLibvipsPath/);
assert.match(sharpRuntime, /LD_LIBRARY_PATH/);
assert.match(readFileSync(join(root, "lib/cast-tv/display-image.ts"), "utf8"), /from "@\/lib\/sharp-runtime"/);
assert.match(readFileSync(join(root, "instrumentation.ts"), "utf8"), /ensureSharpLibvipsPath/);
const tvPlayer = readFileSync(join(root, "components/cast-tv/useCastTvPlaylist.ts"), "utf8");
assert.doesNotMatch(tvPlayer, /postgres_changes/);
assert.match(tvPlayer, /currentIdRef\.current/);
assert.match(tvPlayer, /visitPageAsNewNavigation/);
assert.match(tvPlayer, /TV_HARD_REFRESH_ENDPOINT/);
assert.match(tvPlayer, /castHardReloadNonce/);
assert.match(tvPlayer, /\/api\/cast-tv\/media\?playlist=1/);
assert.match(tvPlayer, /document\.hidden/);
assert.match(tvPlayer, /AbortController/);
assert.match(tvPlayer, /next\.length > 0 \|\| !currentIdRef\.current/);
const imageSlide = readFileSync(join(root, "components/cast-tv/CastTvImageSlide.tsx"), "utf8");
assert.doesNotMatch(imageSlide, /from "next\/image"/);
assert.match(imageSlide, /<img/);
const player = readFileSync(join(root, "components/cast-tv/CastTvPlayer.tsx"), "utf8");
assert.match(player, /visibleItems/);
assert.doesNotMatch(player, /playlist\.map/);
assert.match(player, /cast-tv-broadcast-brand/);
assert.match(player, /\/branding\/fitdog-stream\.png/);
assert.equal(existsSync(join(root, "public/branding/fitdog-stream.png")), true);
const castTvCss = readFileSync(join(root, "app/globals.css"), "utf8");
assert.match(castTvCss, /\.cast-tv-broadcast-brand\s*\{[\s\S]*?pointer-events:\s*none/);
assert.match(castTvCss, /\.cast-tv-broadcast-brand\s*\{[\s\S]*?z-index:\s*10/);

const fileRoute = readFileSync(join(root, "app/api/cast-tv/media/file/route.ts"), "utf8");
assert.match(fileRoute, /transcodeCastTvDisplayImage/);
assert.match(fileRoute, /isTransientCastTvStorageError/);
assert.match(fileRoute, /\? 503 : 404/);
assert.match(fileRoute, /kind === "thumb"/);
assert.match(fileRoute, /storage_missing/);
assert.match(fileRoute, /CAST_TV_THUMB_MAX_EDGE/);
assert.doesNotMatch(fileRoute, /recoverOrphans: true/);
assert.match(uploadClient, /isDuplicateUploadError/);
const storedImage = readFileSync(join(root, "lib/cast-tv/stored-image.ts"), "utf8");
assert.match(storedImage, /getPublicUrl/);
assert.match(storedImage, /cache: "no-store"/);
assert.match(storedImage, /AbortSignal\.timeout\(3_000\)/);
assert.match(storedImage, /Object not found/);
assert.match(storedImage, /markMissingCastTvStorage/);

const queryLog = readFileSync(join(root, "lib/cast-tv/query-log.ts"), "utf8");
assert.match(queryLog, /\[cast-tv-query\]/);
assert.match(queryLog, /NODE_ENV !== "production"/);
assert.equal(CAST_TV_PLAYLIST_CACHE_MS, 20_000);
assert.equal(CAST_TV_ADMIN_PAGE_SIZE, 20);
assert.equal(typeof isCastTvQueryLogEnabled(), "boolean");

const thumbs = readFileSync(join(root, "lib/cast-tv/thumbs.ts"), "utf8");
assert.match(thumbs, /storage\/v1\/render\/image\/public/);
assert.doesNotMatch(thumbs, /from "@\/lib\/cast-tv\/library-store"/);

const fakeMedia: CastTvMediaRecord[] = Array.from({ length: 45 }, (_, index) => ({
  id: `id-${index}`,
  display_name: `Item ${index}`,
  file_name: `item-${index}.jpg`,
  storage_path: `cast-tv/item-${index}.jpg`,
  bucket: "lobby-slideshow",
  public_url: `https://example.test/item-${index}.jpg`,
  media_type: "image",
  mime_type: "image/jpeg",
  file_size_bytes: 1000,
  duration_seconds: null,
  image_display_seconds: 10,
  display_order: index + 1,
  is_enabled: index < 30,
  uploaded_by: null,
  uploaded_by_name: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  storage_missing: index === 40
}));
const activePage = paginateCastTvAdminMedia(fakeMedia, { status: "active", offset: 0, limit: CAST_TV_ADMIN_PAGE_SIZE });
assert.equal(activePage.items.length, 20);
assert.equal(activePage.page.hasMore, true);
assert.equal(activePage.counts.active, 30);
assert.equal(activePage.counts.disabled, 15);
assert.equal(activePage.counts.missing, 1);
assert.equal("content_hash" in activePage.items[0], false);
assert.equal(castTvStorageThumbUrl({ ...fakeMedia[40], storage_missing: true }), null);
assert.match(castTvFileThumbSrc(fakeMedia[0]), /kind=thumb&fallback=1/);

const libraryMigration = readFileSync(join(root, "supabase/migrations/088_cast_tv_library_storage.sql"), "utf8");
assert.match(libraryMigration, /application\/json/);
assert.match(libraryMigration, /lobby-slideshow/);

console.log("cast-tv upload tests passed");

async function testJpegIngest() {
  const loaded = await loadSharp();
  assert.equal(typeof loaded, "function");
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
  assert.equal(normalized.displayReady, true);
  assert.ok(normalized.contentHash);

  const progressive = await sharp({
    create: { width: 32, height: 18, channels: 3, background: { r: 12, g: 80, b: 160 } }
  })
    .jpeg({ quality: 90, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  assert.equal((await sharp(progressive).metadata()).isProgressive, true);
  const transcoded = await transcodeCastTvDisplayImage(progressive);
  const safeMeta = await sharp(transcoded.buffer).metadata();
  assert.equal(safeMeta.format, "jpeg");
  assert.equal(safeMeta.isProgressive, false);
  assert.equal(safeMeta.chromaSubsampling, "4:2:0");

  await assert.rejects(() => transcodeCastTvDisplayImage(Buffer.from('{"not":"an image"}')), /not a valid photo/i);
}

void testJpegIngest()
  .then(() => {
    console.log("cast-tv upload ingest tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
