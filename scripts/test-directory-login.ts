import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const usersSource = readFileSync(join(process.cwd(), "lib/admin/users.ts"), "utf8");
const directoryLoginSource = readFileSync(join(process.cwd(), "lib/staff/directory-login.ts"), "utf8");

assert.match(usersSource, /if \(data\) return data as AdminUserRecord;\s+return null;/);
assert.match(usersSource, /getAdminUserById[\s\S]*?if \(data\) return data as AdminUserRecord;\s+return null;/);
assert.match(
  usersSource,
  /export async function findAdminUserByEmail[\s\S]*?if \(data\) return data as AdminUserRecord;\s+return null;/
);
assert.match(usersSource, /if \(!data\) \{\s+throw new Error\("Admin user not found\."\);/);
assert.match(directoryLoginSource, /"marketing"/);
assert.match(directoryLoginSource, /createAdminUser/);

console.log("directory login tests passed");
