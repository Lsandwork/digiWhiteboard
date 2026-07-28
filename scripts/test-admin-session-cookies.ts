import assert from "node:assert/strict";
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookies, setAdminSessionCookie } from "@/lib/admin/session";

type SetCall = { name: string; value: string; options: Record<string, unknown> };

function mockResponse() {
  const calls: SetCall[] = [];
  return {
    calls,
    cookies: {
      set(name: string, value: string, options: Record<string, unknown> = {}) {
        calls.push({ name, value, options });
      }
    }
  };
}

{
  const res = mockResponse();
  clearAdminSessionCookies(res, "fitdog.ruffops.com");
  assert.equal(res.calls.length, 2, "logout clears host-only and domain cookies");
  assert.ok(res.calls.every((call) => call.name === ADMIN_SESSION_COOKIE));
  assert.ok(res.calls.every((call) => call.value === ""));
  assert.ok(res.calls.every((call) => call.options.maxAge === 0));
  assert.equal(res.calls[0].options.domain, undefined, "first clear is host-only");
  assert.equal(res.calls[1].options.domain, ".ruffops.com", "second clear is shared domain");
}

{
  const res = mockResponse();
  setAdminSessionCookie(res, "token.sig", "fitdog.ruffops.com");
  assert.ok(res.calls.length >= 3, "set clears duplicates then writes session");
  const last = res.calls[res.calls.length - 1];
  assert.equal(last.value, "token.sig");
  assert.equal(last.options.domain, ".ruffops.com");
  assert.ok(Number(last.options.maxAge) > 0);
}

console.log("admin session cookie logout tests passed");
