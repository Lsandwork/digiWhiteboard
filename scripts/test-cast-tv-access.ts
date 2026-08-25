import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const permissions = read("lib/admin/permissions.ts");
const types = read("lib/admin/types.ts");
const nav = read("lib/admin/nav-groups.ts");
const dashboard = read("components/admin/AdminDashboard.tsx");
const migration = read("supabase/migrations/033_cast_tv.sql");

assert.match(permissions, /manage_cast_tv/);
assert.match(permissions, /cast_tv: "manage_cast_tv"/);
assert.match(permissions, /MARKETING_BOARD_TABS/);
assert.match(permissions, /accessibleAdminBoards/);
assert.match(nav, /buildMarketingAdminNav/);
assert.match(types, /"cast_tv"/);
assert.match(nav, /cast_tv: "CAST-TV"/);
assert.match(dashboard, /CastTvPanel/);
assert.match(migration, /cast_tv_media/);
assert.match(migration, /cast_tv_settings/);
assert.match(migration, /cast-tv-media/);
assert.match(migration, /supabase_realtime/);
assert.match(read("supabase/migrations/087_cast_tv_media_upload.sql"), /cast_tv_media_signed_insert/);
assert.match(read("app/api/cast-tv/media/upload/route.ts"), /normalizeCastTvUploadBytes/);
assert.match(read("app/api/cast-tv/media/route.ts"), /getCastTvSupabase/);
assert.match(read("lib/cast-tv/supabase.ts"), /15_000/);
assert.doesNotMatch(read("lib/cast-tv/supabase.ts"), /CAST_TV_SUPABASE_TIMEOUT_MS = 2[0-9]_000/);
assert.match(read("lib/cast-tv/library-store.ts"), /cast-tv-media/);
assert.match(read("lib/cast-tv/api-auth.ts"), /accessFromLegacyRole/);
assert.match(read("app/api/cast-tv/media/upload-url/route.ts"), /handleCastTvWrite/);
assert.match(read("lib/cast-tv/upload-client.ts"), /canFallbackToCastTvServerUpload/);
assert.match(read("lib/cast-tv/upload-client.ts"), /isDuplicateUploadError/);
assert.match(read("app/api/cast-tv/media/file/route.ts"), /transcodeCastTvDisplayImage/);
assert.match(read("app/api/cast-tv/media/file/route.ts"), /isTransientCastTvStorageError/);
assert.match(read("app/api/cast-tv/media/file/route.ts"), /kind === "thumb"/);
assert.match(read("lib/cast-tv/stored-image.ts"), /getPublicUrl/);
assert.match(read("lib/cast-tv/library-store.ts"), /recoverOrphans === true/);
assert.match(read("components/admin/CastTvPanel.tsx"), /CAST_TV_ADMIN_PAGE_SIZE/);
assert.match(read("components/cast-tv/useCastTvPlaylist.ts"), /readCastTvPlaylistCache/);
assert.doesNotMatch(read("app/api/cast-tv/media/route.ts"), /repairCastTvLibraryImages/);
assert.match(read("next.config.mjs"), /"sharp"/);
assert.match(read("next.config.mjs"), /@img\/sharp-libvips-linux-x64/);
assert.match(read("next.config.mjs"), /@img\/sharp-wasm32/);

console.log("cast-tv access tests passed");
