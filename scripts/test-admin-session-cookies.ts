import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookies, setAdminSessionCookie } from "@/lib/admin/session";

{
  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookies(res, "fitdog.ruffops.com");
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [...res.headers.entries()].filter(([key]) => key.toLowerCase() === "set-cookie").map(([, value]) => value);

  const sessionClears = setCookies.filter((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  assert.ok(sessionClears.length >= 2, `expected >=2 clear headers, got ${sessionClears.length}: ${JSON.stringify(sessionClears)}`);
  assert.ok(
    sessionClears.some((value) => value.includes("Domain=.ruffops.com")),
    "clears shared domain cookie"
  );
  assert.ok(
    sessionClears.some((value) => !value.includes("Domain=")),
    "clears host-only cookie"
  );
}

{
  const res = NextResponse.json({ ok: true });
  setAdminSessionCookie(res, "token.sig", "fitdog.ruffops.com");
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [...res.headers.entries()].filter(([key]) => key.toLowerCase() === "set-cookie").map(([, value]) => value);
  assert.ok(setCookies.some((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=token.sig`)));
  assert.ok(setCookies.some((value) => value.includes("Domain=.ruffops.com") && value.includes("token.sig")));
}

console.log("admin session cookie logout tests passed");
