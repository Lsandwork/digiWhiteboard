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

console.log("cast-tv access tests passed");
