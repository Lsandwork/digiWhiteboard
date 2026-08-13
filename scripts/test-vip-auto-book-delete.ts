import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const store = readFileSync(join(root, "lib/staff/vip-auto-book/store.ts"), "utf8");
const route = readFileSync(join(root, "app/api/admin/vip-auto-book/route.ts"), "utf8");
const panel = readFileSync(join(root, "components/admin/VipAutoBookPanel.tsx"), "utf8");

assert.match(store, /export async function deleteVipAutoBookClient/);
assert.match(store, /\.delete\(\)/);
assert.match(route, /deleteVipAutoBookClient/);
assert.match(route, /action === "delete"/);
assert.match(panel, /openEdit/);
assert.match(panel, /action: "delete"/);
assert.match(panel, /Edit VIP Auto Book client/);
assert.match(panel, /Delete VIP client\?/);
assert.match(panel, /Save Changes/);

console.log("vip-auto-book-delete: ok");
