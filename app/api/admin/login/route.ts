import { NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { checkLoginRateLimit, clearLoginAttempts, recordFailedLogin } from "@/lib/admin/rate-limit";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions
} from "@/lib/admin/session";
import { touchAdminUserLogin } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    if (auth.adminUserId) {
      await touchAdminUserLogin(getServiceSupabase(), auth.adminUserId);
    }

    await writeAdminAuditLog({
      actorAdminId: auth.adminUserId,
      actorEmail: auth.email,
      action: "admin.login",
      details: { source: auth.source }
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
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
}
