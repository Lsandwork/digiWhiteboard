import { NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { checkLoginRateLimit, clearLoginAttempts, recordFailedLogin } from "@/lib/admin/rate-limit";
import {
  createAdminSessionToken,
  setAdminSessionCookie
} from "@/lib/admin/session";
import { touchAdminUserLogin } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";

const POST_AUTH_SIDE_EFFECT_MS = 1_500;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    const clientKey =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimit = checkLoginRateLimit(`${clientKey}:${username.toLowerCase()}`);

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
    }

    if (!username || !password) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const auth = await verifyAdminCredentials(username, password);
    if (!auth.ok) {
      recordFailedLogin(`${clientKey}:${username.toLowerCase()}`);
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    clearLoginAttempts(`${clientKey}:${username.toLowerCase()}`);

    // Never let audit/last-login DB writes hang the sign-in response. Production
    // Supabase stalls were leaving the browser on "Signing in..." forever even
    // after credentials already validated.
    await Promise.allSettled([
      auth.adminUserId
        ? withTimeoutFallback(
            touchAdminUserLogin(getServiceSupabase(), auth.adminUserId),
            POST_AUTH_SIDE_EFFECT_MS,
            undefined
          )
        : Promise.resolve(),
      withTimeoutFallback(
        writeAdminAuditLog({
          actorAdminId: auth.adminUserId,
          actorEmail: auth.email,
          action: "admin.login",
          details: { source: auth.source }
        }),
        POST_AUTH_SIDE_EFFECT_MS,
        undefined
      )
    ]);

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
