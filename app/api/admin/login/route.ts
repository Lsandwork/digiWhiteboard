import { after, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  checkLoginThrottle,
  clearLoginThrottle,
  clientIpFromRequest,
  loginThrottleKeys,
  recordLoginFailure
} from "@/lib/admin/rate-limit";
import {
  createAdminSessionToken,
  setAdminSessionCookie
} from "@/lib/admin/session";
import { touchAdminUserLogin } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function throttleSupabase() {
  try {
    return getServiceSupabase({ timeoutMs: 1_000 });
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    const throttleKeys = loginThrottleKeys(clientIpFromRequest(request), username);
    const throttleStore = throttleSupabase();
    const rateLimit = await checkLoginThrottle(throttleStore, throttleKeys);

    if (!rateLimit.allowed) {
      const minutes = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 60_000));
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429, headers: { "retry-after": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } }
      );
    }

    if (!username || !password) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const auth = await verifyAdminCredentials(username, password);
    if (!auth.ok) {
      if (auth.unavailable) {
        return NextResponse.json(
          { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
          { status: 503 }
        );
      }
      await recordLoginFailure(throttleStore, throttleKeys);
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    after(() => clearLoginThrottle(throttleStore, throttleKeys));

    const adminUserId = auth.adminUserId;
    if (adminUserId) {
      after(() => {
        void touchAdminUserLogin(getServiceSupabase({ timeoutMs: 4_000 }), adminUserId, auth.email).catch(() => undefined);
      });
    }

    after(() => {
      void writeAdminAuditLog({
        actorAdminId: auth.adminUserId,
        actorEmail: auth.email,
        action: "admin.login",
        details: { source: auth.source }
      }).catch(() => undefined);
    });

    const token = createAdminSessionToken({
      email: auth.email,
      adminUserId: auth.adminUserId,
      role: auth.role,
      mustChangePassword: auth.forcePasswordChange ?? false,
      isDemo: auth.isDemo ?? false,
      demoRole: auth.isDemo ? auth.demoRole ?? auth.role ?? "owner_admin" : undefined
    });
    const response = NextResponse.json({
      ok: true,
      username: auth.email,
      role: auth.role,
      adminUserId: auth.adminUserId ?? null,
      forcePasswordChange: auth.forcePasswordChange ?? false,
      isDemo: auth.isDemo ?? false
    });
    setAdminSessionCookie(response, token, request.headers.get("host"));
    return response;
  } catch (error) {
    console.error("[admin.login] unexpected failure", error);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 503 }
    );
  }
}
