import assert from "node:assert/strict";
import { isSafeRelativePath, safeUrl } from "../lib/safe-url";

for (const ok of ["/admin", "/admin/users?tab=1", "/gingr#top", "/ruffly/inbox?q=a%2Fb", "/"]) {
  assert.equal(isSafeRelativePath(ok), true, ok);
}

for (const bad of [
  "//evil.com",
  "/\\evil.com",
  "/\\/evil.com",
  "\\\\evil.com",
  "/\t/evil.com",
  "/\n/evil.com",
  "/\r\n/evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "evil.com",
  ""
]) {
  assert.equal(isSafeRelativePath(bad), false, JSON.stringify(bad));
}

assert.equal(safeUrl("/\\evil.com", "/admin"), "/admin");
assert.equal(safeUrl("/admin/users", "/"), "/admin/users");
assert.equal(safeUrl("https://example.com/a", ""), "https://example.com/a");

console.log("safe redirect tests passed");
