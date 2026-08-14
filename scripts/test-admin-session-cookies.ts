import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookies,
  createAdminSessionToken,
  getAdminSessionFromRequest,
  setAdminSessionCookie
} from "@/lib/admin/session";

function setCookies(res: NextResponse) {
  return typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [...res.headers.entries()].filter(([key]) => key.toLowerCase() === "set-cookie").map(([, value]) => value);
}

{
  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookies(res, "fitdog.ruffops.com");
  const sessionClears = setCookies(res).filter((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
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
  const cookies = setCookies(res);
  const sessionCookies = cookies.filter((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  assert.ok(
    sessionCookies.some((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=token.sig`) && !value.includes("Domain=")),
    `expected host-only session cookie, got ${JSON.stringify(sessionCookies)}`
  );
  assert.ok(
    sessionCookies.some((value) => value.includes("Domain=.ruffops.com") && value.includes("token.sig")),
    "sets shared domain session cookie"
  );
  assert.ok(
    !sessionCookies.some((value) => /Max-Age=0(?:;|$)/.test(value) || /Max-Age=0$/.test(value)),
    `login must not expire the session in the same response: ${JSON.stringify(sessionCookies)}`
  );
}

{
  const valid = createAdminSessionToken({ email: "lonnie@fitdog.com", role: "owner_admin" });
  const request = new Request("https://fitdog.ruffops.com/api/admin/session", {
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=stale-not-a-token; ${ADMIN_SESSION_COOKIE}=${valid}`
    }
  });
  const session = getAdminSessionFromRequest(request);
  assert.equal(session?.email, "lonnie@fitdog.com");
}

{
  const prev = process.env.ADMIN_COOKIE_DOMAIN;
  process.env.ADMIN_COOKIE_DOMAIN = ".ruffops.com";
  const res = NextResponse.json({ ok: true });
  setAdminSessionCookie(res, "token.sig", "localhost:3111");
  const cookies = setCookies(res).filter((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  assert.equal(cookies.length, 1, "localhost only gets a host-only cookie");
  assert.ok(!cookies[0]?.includes("Domain="), "localhost cookie has no Domain attribute");
  assert.ok(!cookies[0]?.includes("Secure"), "localhost cookie is not Secure over HTTP");
  process.env.ADMIN_COOKIE_DOMAIN = prev;
}

console.log("admin session cookie logout tests passed");
