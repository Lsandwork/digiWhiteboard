import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const authSource = readFileSync(join(process.cwd(), "lib/admin/auth.ts"), "utf8");
const loginSource = readFileSync(join(process.cwd(), "app/api/admin/login/route.ts"), "utf8");
const usersSource = readFileSync(join(process.cwd(), "lib/admin/users.ts"), "utf8");

assert.match(authSource, /const envValid = isSuperAdminLoginAlias\(normalized\) \? await envPasswordMatches\(password\) : false;/);
assert.match(authSource, /\/\/ Env `admin` login must succeed even when Supabase is down or slow\./);
assert.match(authSource, /ENV_ATTACH_TIMEOUT_MS = 800/);
assert.match(authSource, /AUTH_QUERY_TIMEOUT_MS = 2_500/);
assert.doesNotMatch(authSource, /loadAdminSettings/);
assert.doesNotMatch(authSource, /allow_env_admin_login/);

assert.doesNotMatch(loginSource, /LOGIN_VERIFY_TIMEOUT_MS/);
assert.doesNotMatch(loginSource, /withTimeoutOrThrow/);
assert.match(loginSource, /const auth = await verifyAdminCredentials\(username, password\);/);
assert.match(loginSource, /Sign-in is temporarily unavailable/);
assert.match(loginSource, /auth\.unavailable/);
assert.doesNotMatch(
  loginSource,
  /if \(!auth\.ok\) \{\s*recordFailedLogin/
);

assert.match(authSource, /unavailable\?: boolean/);
assert.match(authSource, /findAdminUsersForLogin/);
assert.match(authSource, /\$\{normalized\}@fitdog\.com/);

assert.match(usersSource, /export async function findAdminUsersByEmails/);
assert.match(usersSource, /export async function findAdminUsersForLogin/);
assert.match(usersSource, /ADMIN_LOGIN_USER_COLUMNS/);
assert.match(usersSource, /\.in\("email", normalized\)/);
assert.match(
  usersSource,
  /export async function findAdminUserByEmail[\s\S]*?findAdminUsersByEmails\(supabase, \[email\]\)/
);

console.log("admin auth env-first tests passed");
